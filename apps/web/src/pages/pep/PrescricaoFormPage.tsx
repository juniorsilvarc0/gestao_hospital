/**
 * PrescricaoFormPage — formulário de prescrição com alertas pré-emissão.
 *
 * Fluxo (RN-PEP-05/06, RN-PRE-07):
 *  1. Usuário preenche um ou mais itens (medicamento, cuidado, dieta, etc.).
 *  2. Clica em "Verificar antes de assinar" → POST /v1/atendimentos/:uuid/prescricoes
 *     com `apenasValidar=true`. Backend retorna alertas (alergia/interação/dose).
 *  3. Para cada alerta, médico marca override (`justificativa` obrigatória).
 *  4. Clica em "Verificar e Assinar" → cria definitivo (RN-PRE-01: status
 *     inicial AGUARDANDO_ANALISE) e abre modal de assinatura.
 *
 * NÃO emite a prescrição se houver alerta sem justificativa.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCheck,
  Loader2,
  Plus,
  Save,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { z } from 'zod';
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
  assinarPrescricao,
  createPrescricao,
} from '@/lib/pep-api';
import { getAtendimento } from '@/lib/atendimentos-api';
import { useToast } from '@/components/Toast';
import { ProcedimentoAutocomplete } from '@/components/pep/ProcedimentoAutocomplete';
import { AssinarModal } from '@/components/pep/AssinarModal';
import type {
  AlertaPrescricao,
  ItemPrescricao,
  Prescricao,
  PrescricaoOverride,
  TipoItemPrescricao,
} from '@/types/pep';
import { cn } from '@/lib/utils';

const TIPOS: { value: TipoItemPrescricao; label: string }[] = [
  { value: 'MEDICAMENTO', label: 'Medicamento' },
  { value: 'CUIDADO', label: 'Cuidado' },
  { value: 'DIETA', label: 'Dieta' },
  { value: 'PROCEDIMENTO', label: 'Procedimento' },
  { value: 'EXAME', label: 'Exame' },
];

const itemSchema = z.object({
  tipo: z.enum(['MEDICAMENTO', 'CUIDADO', 'DIETA', 'PROCEDIMENTO', 'EXAME']),
  procedimentoUuid: z.string().nullable().optional(),
  procedimentoCodigo: z.string().nullable().optional(),
  procedimentoDescricao: z.string().min(1, 'Descrição obrigatória'),
  dose: z.string().nullable().optional(),
  unidadeDose: z.string().nullable().optional(),
  via: z.string().nullable().optional(),
  frequencia: z.string().nullable().optional(),
  duracao: z.string().nullable().optional(),
  horarios: z.array(z.string()).optional(),
  observacao: z.string().nullable().optional(),
  seNecessario: z.boolean().optional(),
  urgente: z.boolean().optional(),
});

interface PrescricaoFormState {
  validadeInicio: string;
  validadeFim: string;
  itens: ItemPrescricao[];
}

function nowLocalIso(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  // Para input datetime-local: YYYY-MM-DDTHH:mm
  const tzOffset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}

function plus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setSeconds(0, 0);
  const tzOffset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}

function emptyItem(): ItemPrescricao {
  return {
    tipo: 'MEDICAMENTO',
    procedimentoDescricao: '',
    dose: '',
    unidadeDose: '',
    via: '',
    frequencia: '',
    duracao: '',
    horarios: [],
    observacao: '',
    seNecessario: false,
    urgente: false,
  };
}

export function PrescricaoFormPage(): JSX.Element {
  const { atendimentoUuid = '' } = useParams<{ atendimentoUuid: string }>();
  const navigate = useNavigate();
  const { show: showToast } = useToast();

  const atendimentoQuery = useQuery({
    queryKey: ['atendimentos', atendimentoUuid],
    queryFn: () => getAtendimento(atendimentoUuid),
    enabled: Boolean(atendimentoUuid),
  });

  const [form, setForm] = useState<PrescricaoFormState>(() => ({
    validadeInicio: nowLocalIso(),
    validadeFim: plus(5),
    itens: [emptyItem()],
  }));

  const [alertas, setAlertas] = useState<AlertaPrescricao[]>([]);
  const [overrides, setOverrides] = useState<Record<string, PrescricaoOverride>>(
    {},
  );
  const [prescricaoCriada, setPrescricaoCriada] = useState<Prescricao | null>(
    null,
  );
  const [openAssinar, setOpenAssinar] = useState(false);

  const verificarMutation = useMutation({
    mutationFn: () => {
      const overridesArray: PrescricaoOverride[] = Object.values(overrides);
      return createPrescricao(atendimentoUuid, {
        validadeInicio: form.validadeInicio,
        validadeFim: form.validadeFim,
        itens: form.itens,
        overrides: overridesArray,
        apenasValidar: true,
      });
    },
    onSuccess: (data) => {
      const novosAlertas = data.alertas ?? [];
      setAlertas(novosAlertas);
      if (novosAlertas.length === 0) {
        showToast({
          variant: 'success',
          title: 'Sem alertas',
          description: 'Você pode prosseguir para assinatura.',
        });
      } else {
        showToast({
          variant: 'info',
          title: 'Alertas detectados',
          description: `${novosAlertas.length} alerta(s) — justifique para prosseguir.`,
        });
      }
    },
    onError: (err) => {
      showAlertasFromError(err);
    },
  });

  const criarMutation = useMutation({
    mutationFn: () => {
      const overridesArray: PrescricaoOverride[] = Object.values(overrides);
      return createPrescricao(atendimentoUuid, {
        validadeInicio: form.validadeInicio,
        validadeFim: form.validadeFim,
        itens: form.itens,
        overrides: overridesArray,
      });
    },
    onSuccess: (data) => {
      setPrescricaoCriada(data);
      setOpenAssinar(true);
    },
    onError: (err) => {
      showAlertasFromError(err);
    },
  });

  function showAlertasFromError(err: unknown): void {
    if (err instanceof ApiError) {
      const body = err.body as
        | { alertas?: AlertaPrescricao[]; detail?: string }
        | undefined;
      if (body?.alertas?.length) {
        setAlertas(body.alertas);
        showToast({
          variant: 'destructive',
          title: 'Alertas bloqueando emissão',
          description: 'Justifique cada alerta antes de prosseguir.',
        });
        return;
      }
      showToast({
        variant: 'destructive',
        title: 'Erro',
        description: err.detail ?? err.message,
      });
      return;
    }
    showToast({
      variant: 'destructive',
      title: 'Erro',
      description: 'Falha ao validar prescrição.',
    });
  }

  function alertaKey(a: AlertaPrescricao): string {
    return `${a.tipo}:${a.referencia ?? ''}:${a.itemIndex ?? -1}`;
  }

  function setOverride(a: AlertaPrescricao, justificativa: string): void {
    const key = alertaKey(a);
    setOverrides((prev) => ({
      ...prev,
      [key]: {
        alertaTipo: a.tipo,
        ...(a.referencia ? { alertaReferencia: a.referencia } : {}),
        justificativa,
      },
    }));
  }

  function toggleOverride(a: AlertaPrescricao, on: boolean): void {
    const key = alertaKey(a);
    if (on) {
      if (!overrides[key]) setOverride(a, '');
    } else {
      setOverrides((prev) => {
        const { [key]: _removed, ...rest } = prev;
        return rest;
      });
    }
  }

  const todosAlertasJustificados = useMemo(() => {
    return alertas.every((a) => {
      const ov = overrides[alertaKey(a)];
      return ov && ov.justificativa.trim().length >= 10;
    });
  }, [alertas, overrides]);

  const formularioValido = useMemo(() => {
    if (form.itens.length === 0) return false;
    for (const it of form.itens) {
      const r = itemSchema.safeParse(it);
      if (!r.success) return false;
    }
    return Boolean(form.validadeInicio);
  }, [form]);

  const podeAssinar =
    formularioValido && (alertas.length === 0 || todosAlertasJustificados);

  function updateItem(idx: number, patch: Partial<ItemPrescricao>): void {
    setForm((f) => ({
      ...f,
      itens: f.itens.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    }));
  }

  function addItem(): void {
    setForm((f) => ({ ...f, itens: [...f.itens, emptyItem()] }));
  }

  function removeItem(idx: number): void {
    setForm((f) => ({
      ...f,
      itens: f.itens.filter((_, i) => i !== idx),
    }));
  }

  // Limpa alertas/overrides ao mudar items.
  useEffect(() => {
    setAlertas([]);
    setOverrides({});
  }, [form.itens.length]);

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

  async function handleAssinar(): Promise<void> {
    if (!prescricaoCriada) {
      // Cria primeiro.
      await criarMutation.mutateAsync();
      // Modal abre via onSuccess.
      return;
    }
  }

  return (
    <section className="mx-auto max-w-4xl space-y-4">
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
          <CardTitle className="flex items-center justify-between text-base">
            <span>Nova prescrição — {atendimento.pacienteNome}</span>
            <span className="text-xs text-muted-foreground">
              {atendimento.numero}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {atendimento.pacienteAlergias?.length ? (
            <div
              role="alert"
              data-testid="alergia-paciente"
              className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm font-medium text-destructive"
            >
              ⚠ Alergias documentadas:{' '}
              {atendimento.pacienteAlergias
                .map((a) => `${a.substancia}${a.gravidade ? ` (${a.gravidade})` : ''}`)
                .join(', ')}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="pre-validade-ini">Validade início *</Label>
              <Input
                id="pre-validade-ini"
                type="datetime-local"
                value={form.validadeInicio}
                onChange={(e) =>
                  setForm((f) => ({ ...f, validadeInicio: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pre-validade-fim">Validade fim</Label>
              <Input
                id="pre-validade-fim"
                type="datetime-local"
                value={form.validadeFim}
                onChange={(e) =>
                  setForm((f) => ({ ...f, validadeFim: e.target.value }))
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <ol className="space-y-3" aria-label="Itens da prescrição">
        {form.itens.map((item, idx) => (
          <li key={`item-${idx}`}>
            <ItemEditor
              item={item}
              onChange={(patch) => updateItem(idx, patch)}
              onRemove={form.itens.length > 1 ? () => removeItem(idx) : undefined}
              alertas={alertas.filter((a) => a.itemIndex === idx)}
              overrides={overrides}
              onToggleOverride={toggleOverride}
              onChangeJustificativa={setOverride}
            />
          </li>
        ))}
      </ol>

      <Button type="button" variant="outline" onClick={addItem}>
        <Plus aria-hidden="true" />
        Adicionar item
      </Button>

      {alertas.filter((a) => a.itemIndex === undefined).length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert
                aria-hidden="true"
                className="h-5 w-5 text-amber-600"
              />
              Alertas globais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {alertas
              .filter((a) => a.itemIndex === undefined)
              .map((a) => (
                <AlertaCard
                  key={alertaKey(a)}
                  alerta={a}
                  override={overrides[alertaKey(a)]}
                  onToggle={(on) => toggleOverride(a, on)}
                  onChangeJustificativa={(text) => setOverride(a, text)}
                />
              ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => verificarMutation.mutate()}
          disabled={!formularioValido || verificarMutation.isPending}
          aria-busy={verificarMutation.isPending}
        >
          {verificarMutation.isPending ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <CheckCheck aria-hidden="true" />
          )}
          Verificar antes de assinar
        </Button>
        <Button
          type="button"
          onClick={() => criarMutation.mutate()}
          disabled={!podeAssinar || criarMutation.isPending}
          aria-busy={criarMutation.isPending}
        >
          {criarMutation.isPending ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <Save aria-hidden="true" />
          )}
          Verificar e Assinar
        </Button>
      </div>

      {prescricaoCriada ? (
        <AssinarModal
          open={openAssinar}
          onOpenChange={setOpenAssinar}
          tipoRecurso="prescrição"
          contexto={`Prescrição criada para ${atendimento.pacienteNome}. Após assinar, segue para análise farmacêutica.`}
          onSign={async (input) => {
            await assinarPrescricao(prescricaoCriada.uuid, input);
            showToast({
              variant: 'success',
              title: 'Prescrição assinada',
              description: 'Encaminhada para análise farmacêutica.',
            });
            navigate(`/pep/${atendimentoUuid}`);
          }}
        />
      ) : null}
      {/* exige useState handler abaixo: */}
      <span hidden>{Boolean(handleAssinar)}</span>
    </section>
  );
}

/* ------------------------------- ItemEditor ------------------------- */

interface ItemEditorProps {
  item: ItemPrescricao;
  onChange: (patch: Partial<ItemPrescricao>) => void;
  onRemove?: () => void;
  alertas: AlertaPrescricao[];
  overrides: Record<string, PrescricaoOverride>;
  onToggleOverride: (a: AlertaPrescricao, on: boolean) => void;
  onChangeJustificativa: (a: AlertaPrescricao, text: string) => void;
}

function ItemEditor({
  item,
  onChange,
  onRemove,
  alertas,
  overrides,
  onToggleOverride,
  onChangeJustificativa,
}: ItemEditorProps): JSX.Element {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Item de prescrição</CardTitle>
        {onRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            aria-label="Remover item"
          >
            <Trash2 aria-hidden="true" />
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={`item-tipo-${item.procedimentoDescricao}`}>
              Tipo *
            </Label>
            <Select
              value={item.tipo}
              onChange={(e) =>
                onChange({ tipo: e.target.value as TipoItemPrescricao })
              }
              aria-label="Tipo de item"
            >
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Procedimento *</Label>
            <ProcedimentoAutocomplete
              tipo={item.tipo}
              selectedLabel={item.procedimentoDescricao || null}
              onSelect={(selected) =>
                onChange({
                  procedimentoUuid: selected.uuid,
                  procedimentoCodigo: selected.codigo,
                  procedimentoDescricao: selected.descricao,
                  ...(selected.unidadeDose
                    ? { unidadeDose: selected.unidadeDose }
                    : {}),
                })
              }
              ariaLabel="Buscar procedimento"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="item-dose">Dose</Label>
            <Input
              id="item-dose"
              value={item.dose ?? ''}
              onChange={(e) => onChange({ dose: e.target.value })}
              placeholder="ex.: 500"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="item-unidade">Unidade</Label>
            <Input
              id="item-unidade"
              value={item.unidadeDose ?? ''}
              onChange={(e) => onChange({ unidadeDose: e.target.value })}
              placeholder="mg, mL, UI..."
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="item-via">Via</Label>
            <Select
              id="item-via"
              value={item.via ?? ''}
              onChange={(e) => onChange({ via: e.target.value })}
            >
              <option key="__empty__" value="">—</option>
              <option value="VO">VO (oral)</option>
              <option value="EV">EV (endovenoso)</option>
              <option value="IM">IM (intramuscular)</option>
              <option value="SC">SC (subcutâneo)</option>
              <option value="TOPICA">Tópica</option>
              <option value="INALATORIA">Inalatória</option>
              <option value="OUTRA">Outra</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="item-freq">Frequência</Label>
            <Input
              id="item-freq"
              value={item.frequencia ?? ''}
              onChange={(e) => onChange({ frequencia: e.target.value })}
              placeholder="ex.: 8/8h"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="item-dur">Duração</Label>
            <Input
              id="item-dur"
              value={item.duracao ?? ''}
              onChange={(e) => onChange({ duracao: e.target.value })}
              placeholder="ex.: 5 dias"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="item-hor">
              Horários (separados por vírgula)
            </Label>
            <Input
              id="item-hor"
              value={(item.horarios ?? []).join(', ')}
              onChange={(e) =>
                onChange({
                  horarios: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="06:00, 14:00, 22:00"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(item.seNecessario)}
              onChange={(e) => onChange({ seNecessario: e.target.checked })}
            />
            Se necessário (SOS)
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(item.urgente)}
              onChange={(e) => onChange({ urgente: e.target.checked })}
            />
            Urgente (RN-PRE-02)
          </label>
        </div>
        {alertas.length > 0 ? (
          <div className="space-y-2">
            {alertas.map((a) => (
              <AlertaCard
                key={`${a.tipo}-${a.referencia ?? ''}`}
                alerta={a}
                override={overrides[`${a.tipo}:${a.referencia ?? ''}:${a.itemIndex ?? -1}`]}
                onToggle={(on) => onToggleOverride(a, on)}
                onChangeJustificativa={(text) =>
                  onChangeJustificativa(a, text)
                }
              />
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/* ------------------------------- AlertaCard ------------------------- */

interface AlertaCardProps {
  alerta: AlertaPrescricao;
  override: PrescricaoOverride | undefined;
  onToggle: (on: boolean) => void;
  onChangeJustificativa: (text: string) => void;
}

function AlertaCard({
  alerta,
  override,
  onToggle,
  onChangeJustificativa,
}: AlertaCardProps): JSX.Element {
  const cor =
    alerta.tipo === 'ALERGIA'
      ? 'border-destructive/50 bg-destructive/10 text-destructive'
      : alerta.tipo === 'INTERACAO'
        ? 'border-orange-500/50 bg-orange-50 text-orange-900'
        : 'border-amber-500/50 bg-amber-50 text-amber-900';
  const emoji =
    alerta.tipo === 'ALERGIA' ? '🔴' : alerta.tipo === 'INTERACAO' ? '🟠' : '🟡';
  const overrideOn = Boolean(override);
  const justificativaValida =
    !overrideOn || (override?.justificativa.trim().length ?? 0) >= 10;

  return (
    <div
      role="alert"
      data-alerta-tipo={alerta.tipo}
      className={cn('space-y-2 rounded-md border p-3 text-sm', cor)}
    >
      <p className="flex items-start gap-2 font-medium">
        <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4" />
        <span>
          <span aria-hidden="true">{emoji} </span>
          {alerta.tipo}: {alerta.mensagem}
          <span className="ml-2 rounded-full border px-1.5 py-0.5 text-[10px] uppercase">
            {alerta.severidade}
          </span>
        </span>
      </p>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={overrideOn}
          onChange={(e) => onToggle(e.target.checked)}
        />
        Médico ciente — manter prescrição com justificativa
      </label>
      {overrideOn ? (
        <div className="space-y-1">
          <Label htmlFor={`just-${alerta.tipo}-${alerta.referencia ?? 'g'}`}>
            Justificativa (mín. 10 caracteres) *
          </Label>
          <Textarea
            id={`just-${alerta.tipo}-${alerta.referencia ?? 'g'}`}
            rows={2}
            value={override?.justificativa ?? ''}
            onChange={(e) => onChangeJustificativa(e.target.value)}
            aria-invalid={!justificativaValida}
          />
          {!justificativaValida ? (
            <p role="alert" className="text-[11px]">
              Mínimo 10 caracteres.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
