/**
 * LaudosCentralPage — Central de Laudos (docs/06 §3.10).
 *
 * Lista paginada de laudos/solicitações com filtros (modalidade, status,
 * data, médico). Cada linha oferece a ação compatível com o status
 * corrente:
 *   - PENDENTE → "Marcar coleta" (POST /solicitacoes-exame/:uuid/coleta).
 *   - EM_REVISAO → "Laudar" (abre split-view).
 *   - FINAL → "Visualizar".
 *
 * Split-view (Sheet largo):
 *   - Esquerda: viewer DICOM placeholder (PACS na Fase 11) ou laudo
 *     readonly se já existe `conteudoHtml`.
 *   - Direita: editor TipTap-like (TextArea com template) + botão
 *     "Assinar e Liberar" → <AssinarModal> → POST /laudos/:uuid/assinar.
 *
 * NÃO consome PHI livre em logs.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Beaker,
  CheckCheck,
  Eye,
  Filter,
  Loader2,
  Stethoscope,
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
  Sheet,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import {
  assinarLaudo,
  getLaudo,
  listLaudos,
  marcarColetaExame,
  salvarLaudoRascunho,
} from '@/lib/pep-api';
import { useToast } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { AssinarModal } from '@/components/pep/AssinarModal';
import { DateRangePicker } from '@/components/pep/DateRangePicker';
import type {
  AssinarEvolucaoInput,
  LaudoDetalhe,
  LaudoResumo,
  ModalidadeExame,
  StatusLaudo,
} from '@/types/pep';
import { cn } from '@/lib/utils';

const MODALIDADES: { value: ModalidadeExame | 'TODOS'; label: string }[] = [
  { value: 'TODOS', label: 'Todas' },
  { value: 'LAB', label: 'Laboratório' },
  { value: 'IMAGEM', label: 'Imagem' },
  { value: 'ANATOMIA_PATOLOGICA', label: 'Anatomia patológica' },
  { value: 'OUTRO', label: 'Outro' },
];

const STATUS: { value: StatusLaudo | 'TODOS'; label: string }[] = [
  { value: 'TODOS', label: 'Todos' },
  { value: 'PENDENTE', label: 'Pendente' },
  { value: 'EM_REVISAO', label: 'Em revisão' },
  { value: 'FINAL', label: 'Laudo final' },
  { value: 'CANCELADO', label: 'Cancelado' },
];

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

interface FiltrosState {
  modalidade: ModalidadeExame | 'TODOS';
  status: StatusLaudo | 'TODOS';
  start: string;
  end: string;
  medicoQuery: string;
}

export function LaudosCentralPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();
  const user = useAuthStore((s) => s.user);
  const perfis = (user?.perfis ?? []).map((p) => p.toUpperCase());
  const podeColetar =
    perfis.includes('ADMIN') ||
    perfis.includes('ENFERMEIRO') ||
    perfis.includes('MEDICO');
  const podeLaudar = perfis.includes('ADMIN') || perfis.includes('MEDICO');

  const [filtros, setFiltros] = useState<FiltrosState>({
    modalidade: 'TODOS',
    status: 'TODOS',
    start: '',
    end: '',
    medicoQuery: '',
  });

  const [laudoAberto, setLaudoAberto] = useState<LaudoResumo | null>(null);

  const laudosQuery = useQuery({
    queryKey: ['laudos', filtros],
    queryFn: () =>
      listLaudos({
        ...(filtros.modalidade !== 'TODOS'
          ? { modalidade: filtros.modalidade }
          : {}),
        ...(filtros.status !== 'TODOS' ? { status: filtros.status } : {}),
        ...(filtros.start ? { data: filtros.start } : {}),
      }),
  });

  const linhasFiltradas = useMemo<LaudoResumo[]>(() => {
    const items = laudosQuery.data?.data ?? [];
    return items.filter((l) => {
      if (filtros.medicoQuery) {
        const q = filtros.medicoQuery.toLowerCase();
        if (!(l.medicoNome ?? '').toLowerCase().includes(q)) return false;
      }
      if (filtros.start || filtros.end) {
        const t = new Date(l.dataExame).getTime();
        if (filtros.start) {
          const s = new Date(`${filtros.start}T00:00:00`).getTime();
          if (t < s) return false;
        }
        if (filtros.end) {
          const e = new Date(`${filtros.end}T23:59:59`).getTime();
          if (t > e) return false;
        }
      }
      return true;
    });
  }, [laudosQuery.data, filtros.medicoQuery, filtros.start, filtros.end]);

  const coletaMutation = useMutation({
    mutationFn: (uuid: string) => marcarColetaExame(uuid),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['laudos'] });
      showToast({
        variant: 'success',
        title: 'Coleta registrada',
        description: 'Solicitação marcada como coletada.',
      });
    },
    onError: (err) => {
      const msg =
        err instanceof ApiError
          ? err.detail ?? err.message
          : 'Falha ao registrar coleta.';
      showToast({ variant: 'destructive', title: 'Erro', description: msg });
    },
  });

  return (
    <section className="space-y-4" aria-label="Central de Laudos">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Beaker aria-hidden="true" className="h-6 w-6 text-cyan-700" />
            Central de Laudos
          </h1>
          <p className="text-sm text-muted-foreground">
            Solicitações, coletas e laudos diagnósticos.
          </p>
        </div>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Filter aria-hidden="true" className="h-4 w-4" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="laudo-modal">Modalidade</Label>
              <Select
                id="laudo-modal"
                value={filtros.modalidade}
                onChange={(e) =>
                  setFiltros((f) => ({
                    ...f,
                    modalidade: e.target.value as ModalidadeExame | 'TODOS',
                  }))
                }
              >
                {MODALIDADES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="laudo-status">Status</Label>
              <Select
                id="laudo-status"
                value={filtros.status}
                onChange={(e) =>
                  setFiltros((f) => ({
                    ...f,
                    status: e.target.value as StatusLaudo | 'TODOS',
                  }))
                }
              >
                {STATUS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="laudo-medico">Médico</Label>
              <Input
                id="laudo-medico"
                value={filtros.medicoQuery}
                onChange={(e) =>
                  setFiltros((f) => ({
                    ...f,
                    medicoQuery: e.target.value,
                  }))
                }
                placeholder="Nome do médico"
              />
            </div>
            <div className="space-y-1">
              <Label>Período</Label>
              <DateRangePicker
                start={filtros.start}
                end={filtros.end}
                onChange={(s, e) =>
                  setFiltros((f) => ({ ...f, start: s, end: e }))
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {laudosQuery.isLoading ? (
            <div className="p-4">
              <Skeleton className="h-32 w-full" />
            </div>
          ) : laudosQuery.isError ? (
            <p role="alert" className="p-4 text-sm text-destructive">
              Falha ao carregar laudos.
            </p>
          ) : linhasFiltradas.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum laudo encontrado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Modalidade</TableHead>
                  <TableHead>Estudo</TableHead>
                  <TableHead>Médico</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhasFiltradas.map((l) => (
                  <TableRow key={l.uuid}>
                    <TableCell className="font-medium">
                      {l.pacienteNome}
                    </TableCell>
                    <TableCell>{l.modalidade}</TableCell>
                    <TableCell>{l.estudo}</TableCell>
                    <TableCell>{l.medicoNome ?? '—'}</TableCell>
                    <TableCell>{formatDate(l.dataExame)}</TableCell>
                    <TableCell>
                      <StatusBadge status={l.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        laudo={l}
                        podeColetar={podeColetar}
                        podeLaudar={podeLaudar}
                        coletaPending={
                          coletaMutation.isPending &&
                          coletaMutation.variables === l.uuid
                        }
                        onColeta={() => coletaMutation.mutate(l.uuid)}
                        onAbrir={() => setLaudoAberto(l)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Sheet
        open={Boolean(laudoAberto)}
        onOpenChange={(open) => {
          if (!open) setLaudoAberto(null);
        }}
        widthClassName="w-full sm:max-w-5xl"
      >
        {laudoAberto ? (
          <LaudoSplitView
            resumo={laudoAberto}
            onClose={() => setLaudoAberto(null)}
          />
        ) : null}
      </Sheet>
    </section>
  );
}

function StatusBadge({ status }: { status: StatusLaudo }): JSX.Element {
  const map: Record<StatusLaudo, string> = {
    PENDENTE: 'bg-amber-100 text-amber-900 border-amber-300',
    EM_REVISAO: 'bg-blue-100 text-blue-900 border-blue-300',
    FINAL: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    CANCELADO: 'bg-red-100 text-red-900 border-red-300 line-through',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        map[status],
      )}
    >
      {status}
    </span>
  );
}

interface RowActionsProps {
  laudo: LaudoResumo;
  podeColetar: boolean;
  podeLaudar: boolean;
  coletaPending: boolean;
  onColeta: () => void;
  onAbrir: () => void;
}

function RowActions({
  laudo,
  podeColetar,
  podeLaudar,
  coletaPending,
  onColeta,
  onAbrir,
}: RowActionsProps): JSX.Element {
  if (laudo.status === 'PENDENTE' && podeColetar) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onColeta}
        disabled={coletaPending}
        aria-busy={coletaPending}
      >
        {coletaPending ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : (
          <CheckCheck aria-hidden="true" />
        )}
        Marcar coleta
      </Button>
    );
  }
  if (laudo.status === 'EM_REVISAO' && podeLaudar) {
    return (
      <Button type="button" size="sm" onClick={onAbrir}>
        <Stethoscope aria-hidden="true" />
        Laudar
      </Button>
    );
  }
  if (laudo.status === 'FINAL') {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onAbrir}
      >
        <Eye aria-hidden="true" />
        Visualizar
      </Button>
    );
  }
  return (
    <Button type="button" size="sm" variant="ghost" onClick={onAbrir}>
      <Eye aria-hidden="true" />
      Detalhes
    </Button>
  );
}

/* ----------------------------- LaudoSplitView ----------------------------- */

interface LaudoSplitViewProps {
  resumo: LaudoResumo;
  onClose: () => void;
}

function templatePorModalidade(modalidade: ModalidadeExame): string {
  switch (modalidade) {
    case 'IMAGEM':
      return 'TÉCNICA: \n\nACHADOS: \n\nIMPRESSÃO: \n';
    case 'LAB':
      return 'RESULTADOS: \n\nINTERPRETAÇÃO: \n';
    case 'ANATOMIA_PATOLOGICA':
      return 'MACROSCOPIA: \n\nMICROSCOPIA: \n\nDIAGNÓSTICO: \n';
    default:
      return 'DESCRIÇÃO: \n\nIMPRESSÃO: \n';
  }
}

function LaudoSplitView({
  resumo,
  onClose,
}: LaudoSplitViewProps): JSX.Element {
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();

  const detalheQuery = useQuery({
    queryKey: ['laudos', resumo.uuid],
    queryFn: () => getLaudo(resumo.uuid),
  });

  const [conteudo, setConteudo] = useState<string>('');
  const [openAssinar, setOpenAssinar] = useState(false);

  const detalhe: LaudoDetalhe | null = detalheQuery.data ?? null;

  // Inicializa textarea uma vez por laudo (template ou rascunho existente).
  useEffect(() => {
    if (!detalhe) return;
    if (conteudo !== '') return;
    const initial =
      detalhe.conteudoHtml ?? templatePorModalidade(detalhe.modalidade);
    setConteudo(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detalhe?.uuid]);

  const rascunhoMutation = useMutation({
    mutationFn: () =>
      salvarLaudoRascunho(resumo.uuid, {
        conteudo: { type: 'doc', text: conteudo },
        conteudoHtml: conteudo,
      }),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Rascunho salvo',
        description: '',
      });
      void queryClient.invalidateQueries({ queryKey: ['laudos'] });
    },
    onError: (err) => {
      const msg =
        err instanceof ApiError
          ? err.detail ?? err.message
          : 'Falha ao salvar rascunho.';
      showToast({ variant: 'destructive', title: 'Erro', description: msg });
    },
  });

  async function handleAssinar(input: AssinarEvolucaoInput): Promise<void> {
    // Garante persistência antes de assinar.
    await salvarLaudoRascunho(resumo.uuid, {
      conteudo: { type: 'doc', text: conteudo },
      conteudoHtml: conteudo,
    });
    await assinarLaudo(resumo.uuid, input);
    showToast({
      variant: 'success',
      title: 'Laudo assinado e liberado',
      description: '',
    });
    void queryClient.invalidateQueries({ queryKey: ['laudos'] });
    onClose();
  }

  const readonly = detalhe?.status === 'FINAL';

  return (
    <div className="flex h-full flex-col">
      <SheetHeader>
        <SheetTitle>Laudo — {resumo.estudo}</SheetTitle>
        <p className="text-xs text-muted-foreground">
          {resumo.pacienteNome} · {resumo.modalidade} ·{' '}
          {formatDate(resumo.dataExame)}
        </p>
      </SheetHeader>

      <div className="grid flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
        <div
          className="flex min-h-[40vh] flex-col rounded-md border bg-muted/40 p-3"
          aria-label="Visualizador DICOM"
        >
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Visualizador DICOM
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Integração com PACS chega na Fase 11. Anexos disponíveis abaixo.
          </p>
          {detalhe?.anexos?.length ? (
            <ul className="mt-3 space-y-1 text-xs">
              {detalhe.anexos.map((a) => (
                <li key={a.url}>
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    {a.descricao}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex min-h-[40vh] flex-col gap-2">
          <Label htmlFor="laudo-conteudo">
            Conteúdo do laudo {readonly ? '(somente leitura)' : ''}
          </Label>
          <Textarea
            id="laudo-conteudo"
            rows={16}
            readOnly={readonly}
            value={conteudo}
            onChange={(e) => setConteudo(e.target.value)}
            className="flex-1 font-mono text-xs"
            aria-label="Conteúdo do laudo"
          />
          {!readonly ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => rascunhoMutation.mutate()}
                disabled={rascunhoMutation.isPending}
              >
                {rascunhoMutation.isPending ? (
                  <Loader2 aria-hidden="true" className="animate-spin" />
                ) : null}
                Salvar rascunho
              </Button>
              <Button type="button" onClick={() => setOpenAssinar(true)}>
                Assinar e Liberar
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <AssinarModal
        open={openAssinar}
        onOpenChange={setOpenAssinar}
        tipoRecurso="laudo"
        contexto="Após assinar, o laudo torna-se imutável (RN-PEP-03)."
        onSign={handleAssinar}
      />
    </div>
  );
}
