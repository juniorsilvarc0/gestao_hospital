/**
 * EvolucaoFormPage — criação/edição de evolução clínica.
 *
 * Comportamento:
 *  - Cria como RASCUNHO no primeiro "Salvar rascunho" (POST).
 *  - Auto-save a cada 10s a partir daí (PATCH com debounce).
 *  - Após assinar (RN-PEP-02), o editor passa a `readonly` (RN-PEP-03).
 *
 * NÃO permite editar evolução já assinada (mostra readonly + badge).
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BadgeCheck, Loader2, Save, Stethoscope } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Label, Select } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import {
  assinarEvolucao,
  createEvolucao,
  getEvolucao,
  updateEvolucao,
} from '@/lib/pep-api';
import { useToast } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { EvolutionEditor, type EvolutionEditorHandle } from '@/components/pep/EvolutionEditor';
import { AssinarModal } from '@/components/pep/AssinarModal';
import { SinaisVitaisInlineModal } from '@/components/pep/SinaisVitaisInlineModal';
import type { TipoProfissionalEvolucao } from '@/types/pep';
import type { SinaisVitais } from '@/types/atendimentos';

const TIPOS_PROF: { value: TipoProfissionalEvolucao; label: string }[] = [
  { value: 'MEDICO', label: 'Médico' },
  { value: 'ENFERMEIRO', label: 'Enfermeiro' },
  { value: 'TECNICO_ENFERMAGEM', label: 'Técnico de enfermagem' },
  { value: 'FISIOTERAPEUTA', label: 'Fisioterapeuta' },
  { value: 'NUTRICIONISTA', label: 'Nutricionista' },
  { value: 'PSICOLOGO', label: 'Psicólogo' },
  { value: 'FONOAUDIOLOGO', label: 'Fonoaudiólogo' },
  { value: 'FARMACEUTICO', label: 'Farmacêutico' },
  { value: 'OUTRO', label: 'Outro' },
];

function inferTipoProf(perfis: string[]): TipoProfissionalEvolucao {
  if (perfis.includes('MEDICO')) return 'MEDICO';
  if (perfis.includes('ENFERMEIRO')) return 'ENFERMEIRO';
  if (perfis.includes('FARMACEUTICO')) return 'FARMACEUTICO';
  if (perfis.includes('FISIOTERAPEUTA')) return 'FISIOTERAPEUTA';
  return 'OUTRO';
}

export function EvolucaoFormPage(): JSX.Element {
  const { atendimentoUuid = '' } = useParams<{ atendimentoUuid: string }>();
  const [search] = useSearchParams();
  const evolucaoUuid = search.get('uuid') ?? null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();
  const user = useAuthStore((s) => s.user);
  const perfis = (user?.perfis ?? []).map((p) => p.toUpperCase());

  const editorRef = useRef<EvolutionEditorHandle | null>(null);
  const [tipoProf, setTipoProf] = useState<TipoProfissionalEvolucao>(() =>
    inferTipoProf(perfis),
  );
  const [openAssinar, setOpenAssinar] = useState(false);
  const [openVitalsInline, setOpenVitalsInline] = useState(false);
  const [savedUuid, setSavedUuid] = useState<string | null>(evolucaoUuid);
  const [assinada, setAssinada] = useState(false);

  const evolucaoQuery = useQuery({
    queryKey: ['pep', 'evolucao', savedUuid],
    queryFn: () => getEvolucao(savedUuid ?? '', 'EVOLUCAO'),
    enabled: Boolean(savedUuid),
  });

  useEffect(() => {
    const data = evolucaoQuery.data;
    if (!data) return;
    if (data.status === 'ASSINADA') setAssinada(true);
    if (data.tipoProfissional) setTipoProf(data.tipoProfissional);
    if (data.conteudoHtml && editorRef.current) {
      editorRef.current.setContent(data.conteudoHtml);
    }
  }, [evolucaoQuery.data]);

  const createMutation = useMutation({
    mutationFn: () => {
      const html = editorRef.current?.getHTML() ?? '';
      const json = editorRef.current?.getJSON() ?? { type: 'doc', content: [] };
      return createEvolucao(atendimentoUuid, {
        tipoProfissional: tipoProf,
        conteudo: json,
        conteudoHtml: html,
      });
    },
    onSuccess: (data) => {
      setSavedUuid(data.uuid);
      showToast({
        variant: 'success',
        title: 'Rascunho salvo',
        description: '',
      });
      void queryClient.invalidateQueries({
        queryKey: ['pep', 'timeline', atendimentoUuid],
      });
    },
    onError: (err) => {
      const msg =
        err instanceof ApiError ? err.detail ?? err.message : 'Erro ao salvar.';
      showToast({ variant: 'destructive', title: 'Erro', description: msg });
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!savedUuid) throw new Error('Sem rascunho salvo.');
      const html = editorRef.current?.getHTML() ?? '';
      const json = editorRef.current?.getJSON() ?? { type: 'doc', content: [] };
      return updateEvolucao(savedUuid, {
        conteudo: json,
        conteudoHtml: html,
      });
    },
    onError: (err) => {
      const msg =
        err instanceof ApiError ? err.detail ?? err.message : 'Auto-save falhou.';
      showToast({ variant: 'destructive', title: 'Auto-save', description: msg });
    },
  });

  function handleSalvarRascunho(): void {
    if (!savedUuid) {
      createMutation.mutate();
    } else {
      updateMutation.mutate();
    }
  }

  function handleAutoSave(): void {
    // Auto-save só após primeiro POST (rascunho persistido) e nunca quando
    // assinada (editor fica readonly mesmo).
    if (!savedUuid || assinada) return;
    updateMutation.mutate();
  }

  function handleVerificarEAssinar(): void {
    // Garante persistência antes de abrir modal.
    if (!savedUuid) {
      createMutation.mutate(undefined, {
        onSuccess: () => setOpenAssinar(true),
      });
    } else {
      updateMutation.mutate(undefined, {
        onSuccess: () => setOpenAssinar(true),
        onError: () => setOpenAssinar(true),
      });
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
        {assinada ? (
          <span
            data-testid="badge-assinado"
            className="inline-flex items-center gap-1 rounded-full border border-emerald-500 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-900"
          >
            <BadgeCheck aria-hidden="true" className="h-3 w-3" />
            ASSINADO ✓
          </span>
        ) : null}
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Stethoscope aria-hidden="true" className="h-4 w-4" />
            Evolução
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="evol-tipo-prof">Tipo profissional *</Label>
              <Select
                id="evol-tipo-prof"
                value={tipoProf}
                onChange={(e) =>
                  setTipoProf(e.target.value as TipoProfissionalEvolucao)
                }
                disabled={assinada}
              >
                {TIPOS_PROF.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <EvolutionEditor
            ref={editorRef}
            initialHtml={evolucaoQuery.data?.conteudoHtml ?? ''}
            readonly={assinada}
            onAutoSave={() => handleAutoSave()}
            onRequestSinaisVitais={() => setOpenVitalsInline(true)}
          />

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleSalvarRascunho}
              disabled={
                assinada ||
                createMutation.isPending ||
                updateMutation.isPending
              }
              aria-busy={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <Save aria-hidden="true" />
              )}
              Salvar rascunho
            </Button>
            <Button
              type="button"
              onClick={handleVerificarEAssinar}
              disabled={assinada}
            >
              Verificar e Assinar
            </Button>
          </div>
        </CardContent>
      </Card>

      {savedUuid ? (
        <AssinarModal
          open={openAssinar}
          onOpenChange={setOpenAssinar}
          tipoRecurso="evolução"
          contexto="Evoluções assinadas tornam-se imutáveis (RN-PEP-03)."
          onSign={async (input) => {
            const resp = await assinarEvolucao(savedUuid, input);
            setAssinada(resp.status === 'ASSINADA');
            showToast({
              variant: 'success',
              title: 'Evolução assinada',
              description: 'Registro imutável a partir deste momento.',
            });
            void queryClient.invalidateQueries({
              queryKey: ['pep', 'timeline', atendimentoUuid],
            });
          }}
        />
      ) : null}

      <SinaisVitaisInlineModal
        open={openVitalsInline}
        onOpenChange={setOpenVitalsInline}
        onConfirm={(values: SinaisVitais, _confirmado, evaDor) => {
          const insertVitals = (
            editorRef.current as unknown as
              | { insertVitals?: (v: SinaisVitais) => void }
              | null
          )?.insertVitals;
          insertVitals?.({
            ...values,
            evaDor,
          });
        }}
      />
    </section>
  );
}
