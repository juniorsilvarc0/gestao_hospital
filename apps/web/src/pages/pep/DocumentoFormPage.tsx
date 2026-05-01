/**
 * DocumentoFormPage — emissão de documentos clínicos (PEP).
 *
 * Tipos suportados:
 *   ATESTADO, RECEITA_SIMPLES, RECEITA_CONTROLADO, DECLARACAO,
 *   ENCAMINHAMENTO, RESUMO_ALTA.
 *
 * Fluxo:
 *   1. Usuário escolhe tipo → form muda dinamicamente.
 *   2. "Pré-visualizar PDF": cria documento como RASCUNHO via POST e
 *      abre `<iframe>` com `GET /v1/documentos/:uuid/pdf` em modal.
 *   3. "Assinar e Emitir": cria (se ainda não criado) e abre
 *      `<AssinarModal>` → POST /documentos/:uuid/assinar.
 *
 * NÃO emite o documento sem o usuário escolher tipo + preencher campos
 * obrigatórios (validados via zod).
 */
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import {
  ArrowLeft,
  FileText,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  Textarea,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import {
  assinarDocumento,
  buildDocumentoPdfUrl,
  createDocumento,
} from '@/lib/pep-api';
import { getAtendimento } from '@/lib/atendimentos-api';
import { useToast } from '@/components/Toast';
import { AssinarModal } from '@/components/pep/AssinarModal';
import type {
  DocumentoConteudo,
  DocumentoEmitido,
  DocumentoMedicamento,
  TipoDocumento,
} from '@/types/pep';

const TIPOS: { value: TipoDocumento; label: string }[] = [
  { value: 'ATESTADO', label: 'Atestado médico' },
  { value: 'RECEITA_SIMPLES', label: 'Receita simples' },
  { value: 'RECEITA_CONTROLADO', label: 'Receita controlada' },
  { value: 'DECLARACAO', label: 'Declaração' },
  { value: 'ENCAMINHAMENTO', label: 'Encaminhamento' },
  { value: 'RESUMO_ALTA', label: 'Resumo de alta' },
];

const TARJAS: {
  value: 'AMARELA' | 'AZUL' | 'BRANCA' | 'PRETA';
  label: string;
}[] = [
  { value: 'AMARELA', label: 'Amarela (A1/A2/A3)' },
  { value: 'AZUL', label: 'Azul (B1/B2)' },
  { value: 'BRANCA', label: 'Branca (C1)' },
  { value: 'PRETA', label: 'Preta' },
];

/* --------------------------- Validações zod --------------------------- */

const medicamentoSchema = z.object({
  descricao: z.string().min(1),
  dose: z.string().min(1),
  via: z.string().min(1),
  frequencia: z.string().min(1),
  duracao: z.string().optional(),
  observacao: z.string().optional(),
});

function emptyMedicamento(): DocumentoMedicamento {
  return {
    descricao: '',
    dose: '',
    via: '',
    frequencia: '',
    duracao: '',
    observacao: '',
  };
}

interface FormState {
  tipo: TipoDocumento;
  // Atestado
  cidPrincipal: string;
  diasAfastamento: string;
  // Comum / declaração
  observacao: string;
  texto: string;
  finalidade: string;
  // Encaminhamento
  especialidadeDestino: string;
  motivo: string;
  cid: string;
  urgencia: 'ROTINA' | 'URGENTE' | 'EMERGENCIA';
  // Receita controlada
  numeroSequencial: string;
  tarja: 'AMARELA' | 'AZUL' | 'BRANCA' | 'PRETA';
  // Receita / resumo: lista de medicamentos
  medicamentos: DocumentoMedicamento[];
  // Resumo alta
  cidsPrincipais: string;
  procedimentosRealizados: string;
  recomendacoes: string;
}

function initialState(): FormState {
  return {
    tipo: 'ATESTADO',
    cidPrincipal: '',
    diasAfastamento: '1',
    observacao: '',
    texto: '',
    finalidade: '',
    especialidadeDestino: '',
    motivo: '',
    cid: '',
    urgencia: 'ROTINA',
    numeroSequencial: '',
    tarja: 'AMARELA',
    medicamentos: [emptyMedicamento()],
    cidsPrincipais: '',
    procedimentosRealizados: '',
    recomendacoes: '',
  };
}

function buildConteudo(form: FormState): DocumentoConteudo | null {
  switch (form.tipo) {
    case 'ATESTADO': {
      const dias = Number(form.diasAfastamento);
      if (!form.cidPrincipal.trim()) return null;
      if (!Number.isFinite(dias) || dias < 1 || dias > 365) return null;
      return {
        tipo: 'ATESTADO',
        cidPrincipal: form.cidPrincipal.trim(),
        diasAfastamento: dias,
        ...(form.observacao ? { observacao: form.observacao } : {}),
      };
    }
    case 'RECEITA_SIMPLES': {
      const meds: DocumentoMedicamento[] = [];
      for (const m of form.medicamentos) {
        const r = medicamentoSchema.safeParse(m);
        if (!r.success) return null;
        meds.push(m);
      }
      if (meds.length === 0) return null;
      return {
        tipo: 'RECEITA_SIMPLES',
        medicamentos: meds,
        ...(form.observacao ? { observacao: form.observacao } : {}),
      };
    }
    case 'RECEITA_CONTROLADO': {
      const meds: DocumentoMedicamento[] = [];
      for (const m of form.medicamentos) {
        const r = medicamentoSchema.safeParse(m);
        if (!r.success) return null;
        meds.push(m);
      }
      if (meds.length === 0) return null;
      return {
        tipo: 'RECEITA_CONTROLADO',
        medicamentos: meds,
        tarja: form.tarja,
        ...(form.numeroSequencial
          ? { numeroSequencial: form.numeroSequencial }
          : {}),
        ...(form.observacao ? { observacao: form.observacao } : {}),
      };
    }
    case 'DECLARACAO': {
      if (!form.finalidade.trim() || form.texto.trim().length < 5) return null;
      return {
        tipo: 'DECLARACAO',
        finalidade: form.finalidade.trim(),
        texto: form.texto.trim(),
      };
    }
    case 'ENCAMINHAMENTO': {
      if (!form.especialidadeDestino.trim() || !form.motivo.trim()) return null;
      return {
        tipo: 'ENCAMINHAMENTO',
        especialidadeDestino: form.especialidadeDestino.trim(),
        motivo: form.motivo.trim(),
        ...(form.cid ? { cid: form.cid.trim() } : {}),
      };
    }
    case 'RESUMO_ALTA': {
      const meds: DocumentoMedicamento[] = [];
      for (const m of form.medicamentos) {
        if (m.descricao.trim()) {
          const r = medicamentoSchema.safeParse(m);
          if (!r.success) return null;
          meds.push(m);
        }
      }
      const cids = form.cidsPrincipais
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const procs = form.procedimentosRealizados
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      if (cids.length === 0 || form.recomendacoes.trim().length < 5) return null;
      return {
        tipo: 'RESUMO_ALTA',
        cidsPrincipais: cids,
        procedimentosRealizados: procs,
        prescricaoAlta: meds,
        recomendacoes: form.recomendacoes.trim(),
      };
    }
    default:
      return null;
  }
}

export function DocumentoFormPage(): JSX.Element {
  const { uuid: atendimentoUuid = '' } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const { show: showToast } = useToast();

  const atendimentoQuery = useQuery({
    queryKey: ['atendimentos', atendimentoUuid],
    queryFn: () => getAtendimento(atendimentoUuid),
    enabled: Boolean(atendimentoUuid),
  });

  const [form, setForm] = useState<FormState>(initialState);
  const [openPreview, setOpenPreview] = useState(false);
  const [openAssinar, setOpenAssinar] = useState(false);
  const [documentoCriado, setDocumentoCriado] =
    useState<DocumentoEmitido | null>(null);

  const conteudoValido = useMemo(() => buildConteudo(form), [form]);
  const formValido = conteudoValido !== null;

  const criarMutation = useMutation({
    mutationFn: () => {
      const conteudo = buildConteudo(form);
      if (!conteudo) {
        throw new ApiError({
          message: 'Formulário inválido.',
          status: 400,
          code: 'VALIDATION',
        });
      }
      return createDocumento(atendimentoUuid, {
        tipo: form.tipo,
        conteudo,
      });
    },
    onError: (err) => {
      const msg =
        err instanceof ApiError
          ? err.detail ?? err.message
          : 'Falha ao salvar documento.';
      showToast({ variant: 'destructive', title: 'Erro', description: msg });
    },
  });

  async function handlePreview(): Promise<void> {
    let doc = documentoCriado;
    if (!doc) {
      doc = await criarMutation.mutateAsync();
      setDocumentoCriado(doc);
    }
    setOpenPreview(true);
  }

  async function handleAssinarFlow(): Promise<void> {
    if (!documentoCriado) {
      const doc = await criarMutation.mutateAsync();
      setDocumentoCriado(doc);
    }
    setOpenAssinar(true);
  }

  function updateForm(patch: Partial<FormState>): void {
    setForm((f) => ({ ...f, ...patch }));
    // Mudar tipo invalida o documento criado anteriormente.
    if ('tipo' in patch && patch.tipo !== form.tipo) {
      setDocumentoCriado(null);
    }
  }

  function updateMedicamento(
    idx: number,
    patch: Partial<DocumentoMedicamento>,
  ): void {
    setForm((f) => ({
      ...f,
      medicamentos: f.medicamentos.map((m, i) =>
        i === idx ? { ...m, ...patch } : m,
      ),
    }));
    setDocumentoCriado(null);
  }

  function addMedicamento(): void {
    setForm((f) => ({
      ...f,
      medicamentos: [...f.medicamentos, emptyMedicamento()],
    }));
    setDocumentoCriado(null);
  }

  function removeMedicamento(idx: number): void {
    setForm((f) => ({
      ...f,
      medicamentos: f.medicamentos.filter((_, i) => i !== idx),
    }));
    setDocumentoCriado(null);
  }

  if (atendimentoQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>;
  }
  if (atendimentoQuery.isError || !atendimentoQuery.data) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Falha ao carregar atendimento.
      </p>
    );
  }

  const atendimento = atendimentoQuery.data;

  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <header className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/pep/${atendimentoUuid}`)}
        >
          <ArrowLeft aria-hidden="true" />
          Voltar ao PEP
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText aria-hidden="true" className="h-4 w-4" />
            Novo documento — {atendimento.pacienteNome}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="doc-tipo">Tipo *</Label>
            <Select
              id="doc-tipo"
              value={form.tipo}
              onChange={(e) =>
                updateForm({ tipo: e.target.value as TipoDocumento })
              }
            >
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>

          {form.tipo === 'ATESTADO' ? (
            <AtestadoFields form={form} onChange={updateForm} />
          ) : null}
          {form.tipo === 'RECEITA_SIMPLES' ? (
            <ReceitaFields
              form={form}
              onChangeForm={updateForm}
              onUpdate={updateMedicamento}
              onAdd={addMedicamento}
              onRemove={removeMedicamento}
            />
          ) : null}
          {form.tipo === 'RECEITA_CONTROLADO' ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="doc-num">Número sequencial</Label>
                  <Input
                    id="doc-num"
                    value={form.numeroSequencial}
                    onChange={(e) =>
                      updateForm({ numeroSequencial: e.target.value })
                    }
                    placeholder="auto-gerado pelo backend se vazio"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="doc-tarja">Tarja *</Label>
                  <Select
                    id="doc-tarja"
                    value={form.tarja}
                    onChange={(e) =>
                      updateForm({
                        tarja: e.target.value as FormState['tarja'],
                      })
                    }
                  >
                    {TARJAS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <ReceitaFields
                form={form}
                onChangeForm={updateForm}
                onUpdate={updateMedicamento}
                onAdd={addMedicamento}
                onRemove={removeMedicamento}
              />
            </>
          ) : null}
          {form.tipo === 'DECLARACAO' ? (
            <DeclaracaoFields form={form} onChange={updateForm} />
          ) : null}
          {form.tipo === 'ENCAMINHAMENTO' ? (
            <EncaminhamentoFields form={form} onChange={updateForm} />
          ) : null}
          {form.tipo === 'RESUMO_ALTA' ? (
            <ResumoAltaFields
              form={form}
              onChangeForm={updateForm}
              onUpdate={updateMedicamento}
              onAdd={addMedicamento}
              onRemove={removeMedicamento}
            />
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void handlePreview();
              }}
              disabled={!formValido || criarMutation.isPending}
            >
              {criarMutation.isPending ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : null}
              Pré-visualizar PDF
            </Button>
            <Button
              type="button"
              onClick={() => {
                void handleAssinarFlow();
              }}
              disabled={!formValido || criarMutation.isPending}
            >
              Assinar e Emitir
            </Button>
          </div>
        </CardContent>
      </Card>

      {documentoCriado ? (
        <AssinarModal
          open={openAssinar}
          onOpenChange={setOpenAssinar}
          tipoRecurso="documento"
          contexto={`Documento ${TIPOS.find((t) => t.value === form.tipo)?.label} para ${atendimento.pacienteNome}.`}
          onSign={async (input) => {
            await assinarDocumento(documentoCriado.uuid, input);
            showToast({
              variant: 'success',
              title: 'Documento emitido',
              description: 'PDF assinado disponível no PEP.',
            });
            navigate(`/pep/${atendimentoUuid}`);
          }}
        />
      ) : null}

      {openPreview && documentoCriado ? (
        <PreviewModal
          uuid={documentoCriado.uuid}
          onClose={() => setOpenPreview(false)}
        />
      ) : null}
    </section>
  );
}

/* ----------------------------- Subforms ----------------------------- */

function AtestadoFields({
  form,
  onChange,
}: {
  form: FormState;
  onChange: (patch: Partial<FormState>) => void;
}): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="space-y-1">
        <Label htmlFor="doc-cid">CID-10 *</Label>
        <Input
          id="doc-cid"
          value={form.cidPrincipal}
          onChange={(e) => onChange({ cidPrincipal: e.target.value })}
          placeholder="ex.: J11.1"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="doc-dias">Dias de afastamento *</Label>
        <Input
          id="doc-dias"
          type="number"
          min={1}
          max={365}
          value={form.diasAfastamento}
          onChange={(e) => onChange({ diasAfastamento: e.target.value })}
        />
      </div>
      <div className="space-y-1 sm:col-span-3">
        <Label htmlFor="doc-obs">Observação</Label>
        <Textarea
          id="doc-obs"
          rows={3}
          value={form.observacao}
          onChange={(e) => onChange({ observacao: e.target.value })}
        />
      </div>
    </div>
  );
}

function ReceitaFields({
  form,
  onChangeForm,
  onUpdate,
  onAdd,
  onRemove,
}: {
  form: FormState;
  onChangeForm: (patch: Partial<FormState>) => void;
  onUpdate: (idx: number, patch: Partial<DocumentoMedicamento>) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
}): JSX.Element {
  return (
    <div className="space-y-3">
      <div className="space-y-2" aria-label="Medicamentos">
        {form.medicamentos.map((m, idx) => (
          <Card key={`med-${idx}`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs">Medicamento {idx + 1}</CardTitle>
              {form.medicamentos.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemove(idx)}
                  aria-label="Remover medicamento"
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor={`med-desc-${idx}`}>Descrição *</Label>
                  <Input
                    id={`med-desc-${idx}`}
                    value={m.descricao}
                    onChange={(e) =>
                      onUpdate(idx, { descricao: e.target.value })
                    }
                    placeholder="Ex.: Dipirona 500mg"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`med-dose-${idx}`}>Dose *</Label>
                  <Input
                    id={`med-dose-${idx}`}
                    value={m.dose}
                    onChange={(e) => onUpdate(idx, { dose: e.target.value })}
                    placeholder="ex.: 1cp"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`med-via-${idx}`}>Via *</Label>
                  <Input
                    id={`med-via-${idx}`}
                    value={m.via}
                    onChange={(e) => onUpdate(idx, { via: e.target.value })}
                    placeholder="VO/EV/IM..."
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`med-freq-${idx}`}>Frequência *</Label>
                  <Input
                    id={`med-freq-${idx}`}
                    value={m.frequencia}
                    onChange={(e) =>
                      onUpdate(idx, { frequencia: e.target.value })
                    }
                    placeholder="8/8h"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`med-dur-${idx}`}>Duração</Label>
                  <Input
                    id={`med-dur-${idx}`}
                    value={m.duracao ?? ''}
                    onChange={(e) =>
                      onUpdate(idx, { duracao: e.target.value })
                    }
                    placeholder="5 dias"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor={`med-obs-${idx}`}>Observação</Label>
                  <Input
                    id={`med-obs-${idx}`}
                    value={m.observacao ?? ''}
                    onChange={(e) =>
                      onUpdate(idx, { observacao: e.target.value })
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus aria-hidden="true" />
          Adicionar medicamento
        </Button>
      </div>
      <div className="space-y-1">
        <Label htmlFor="doc-rec-obs">Observação geral</Label>
        <Textarea
          id="doc-rec-obs"
          rows={2}
          value={form.observacao}
          onChange={(e) => onChangeForm({ observacao: e.target.value })}
        />
      </div>
    </div>
  );
}

function DeclaracaoFields({
  form,
  onChange,
}: {
  form: FormState;
  onChange: (patch: Partial<FormState>) => void;
}): JSX.Element {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="doc-fin">Finalidade *</Label>
        <Input
          id="doc-fin"
          value={form.finalidade}
          onChange={(e) => onChange({ finalidade: e.target.value })}
          placeholder="ex.: Comparecimento em consulta"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="doc-texto">Texto livre *</Label>
        <Textarea
          id="doc-texto"
          rows={6}
          value={form.texto}
          onChange={(e) => onChange({ texto: e.target.value })}
        />
      </div>
    </div>
  );
}

function EncaminhamentoFields({
  form,
  onChange,
}: {
  form: FormState;
  onChange: (patch: Partial<FormState>) => void;
}): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <Label htmlFor="doc-esp">Especialidade destino *</Label>
        <Input
          id="doc-esp"
          value={form.especialidadeDestino}
          onChange={(e) => onChange({ especialidadeDestino: e.target.value })}
          placeholder="ex.: Cardiologia"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="doc-urg">Urgência</Label>
        <Select
          id="doc-urg"
          value={form.urgencia}
          onChange={(e) =>
            onChange({ urgencia: e.target.value as FormState['urgencia'] })
          }
        >
          <option value="ROTINA">Rotina</option>
          <option value="URGENTE">Urgente</option>
          <option value="EMERGENCIA">Emergência</option>
        </Select>
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="doc-mot">Motivo *</Label>
        <Textarea
          id="doc-mot"
          rows={3}
          value={form.motivo}
          onChange={(e) => onChange({ motivo: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="doc-cid2">CID</Label>
        <Input
          id="doc-cid2"
          value={form.cid}
          onChange={(e) => onChange({ cid: e.target.value })}
          placeholder="ex.: I10"
        />
      </div>
    </div>
  );
}

function ResumoAltaFields({
  form,
  onChangeForm,
  onUpdate,
  onAdd,
  onRemove,
}: {
  form: FormState;
  onChangeForm: (patch: Partial<FormState>) => void;
  onUpdate: (idx: number, patch: Partial<DocumentoMedicamento>) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
}): JSX.Element {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="doc-cids">CIDs principais (separados por vírgula) *</Label>
        <Input
          id="doc-cids"
          value={form.cidsPrincipais}
          onChange={(e) => onChangeForm({ cidsPrincipais: e.target.value })}
          placeholder="ex.: I10, E11"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="doc-procs">
          Procedimentos realizados (um por linha)
        </Label>
        <Textarea
          id="doc-procs"
          rows={3}
          value={form.procedimentosRealizados}
          onChange={(e) =>
            onChangeForm({ procedimentosRealizados: e.target.value })
          }
        />
      </div>
      <ReceitaFields
        form={form}
        onChangeForm={onChangeForm}
        onUpdate={onUpdate}
        onAdd={onAdd}
        onRemove={onRemove}
      />
      <div className="space-y-1">
        <Label htmlFor="doc-rec">Recomendações *</Label>
        <Textarea
          id="doc-rec"
          rows={4}
          value={form.recomendacoes}
          onChange={(e) => onChangeForm({ recomendacoes: e.target.value })}
        />
      </div>
    </div>
  );
}

/* ----------------------------- Preview ------------------------------ */

function PreviewModal({
  uuid,
  onClose,
}: {
  uuid: string;
  onClose: () => void;
}): JSX.Element {
  const url = buildDocumentoPdfUrl(uuid);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pré-visualização do PDF"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="relative h-[85vh] w-full max-w-4xl overflow-hidden rounded-md border bg-background shadow-lg">
        <div className="flex items-center justify-between border-b p-3">
          <p className="text-sm font-semibold">Pré-visualização</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X aria-hidden="true" />
          </Button>
        </div>
        <iframe
          title="Pré-visualização do documento"
          src={url}
          className="h-[calc(100%-3rem)] w-full"
        />
      </div>
    </div>
  );
}
