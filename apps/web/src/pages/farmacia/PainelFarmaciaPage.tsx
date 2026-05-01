/**
 * PainelFarmaciaPage — Painel da farmácia em tempo real.
 *
 * Layout: 4 colunas (uma por turno: MANHA, TARDE, NOITE, MADRUGADA).
 * Cada coluna lista as dispensações pendentes/separadas/dispensadas do
 * turno e oferece os botões de transição:
 *   - Separar    → POST /v1/dispensacoes/:uuid/separar
 *   - Dispensar  → POST /v1/dispensacoes/:uuid/dispensar
 *   - Devolver   → POST /v1/dispensacoes/:uuid/devolver (com Dialog para
 *                  motivo + itens devolvidos)
 *
 * Tempo real via Socket.IO (`useFarmaciaPainelWS`). Em cada evento
 * `dispensacao.*` o painel re-fetcha o snapshot.
 *
 * Filtros:
 *   - turno (default: TODOS)
 *   - data (default: hoje)
 *   - status (PENDENTE+SEPARADA por padrão)
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Clock,
  Loader2,
  Pill,
  RefreshCw,
  RotateCcw,
  Sun,
  Sunrise,
  Sunset,
  Moon,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  Textarea,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import {
  devolverDispensacao,
  dispensarDispensacao,
  getPainel,
  separarDispensacao,
} from '@/lib/farmacia-api';
import { useFarmaciaPainelWS } from '@/lib/ws-client';
import { useToast } from '@/components/Toast';
import {
  DISPENSACAO_STATUSES,
  DISPENSACAO_TURNOS,
  DISPENSACAO_STATUS_LABEL,
  DISPENSACAO_TURNO_LABEL,
  type Dispensacao,
  type DispensacaoStatus,
  type DispensacaoTurno,
} from '@/types/farmacia';
import { cn } from '@/lib/utils';

const TURNO_ICON: Record<DispensacaoTurno, typeof Sun> = {
  MANHA: Sunrise,
  TARDE: Sun,
  NOITE: Sunset,
  MADRUGADA: Moon,
};

const STATUS_BADGE: Record<DispensacaoStatus, string> = {
  PENDENTE: 'bg-amber-100 text-amber-900 border-amber-300',
  SEPARADA: 'bg-blue-100 text-blue-900 border-blue-300',
  DISPENSADA: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  DEVOLVIDA: 'bg-zinc-200 text-zinc-900 border-zinc-300',
  CANCELADA: 'bg-red-100 text-red-900 border-red-300',
};

function formatDateTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    '0',
  )}-${String(d.getDate()).padStart(2, '0')}`;
}

export function PainelFarmaciaPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();

  const [turnoFiltro, setTurnoFiltro] = useState<'TODOS' | DispensacaoTurno>(
    'TODOS',
  );
  const [dataFiltro, setDataFiltro] = useState<string>(todayISO());
  const [statusFiltro, setStatusFiltro] = useState<Set<DispensacaoStatus>>(
    () => new Set<DispensacaoStatus>(['PENDENTE', 'SEPARADA']),
  );

  const [devolverOpen, setDevolverOpen] = useState(false);
  const [dispensacaoAtiva, setDispensacaoAtiva] = useState<Dispensacao | null>(
    null,
  );

  const painelQuery = useQuery({
    queryKey: [
      'farmacia',
      'painel',
      { turno: turnoFiltro, data: dataFiltro },
    ],
    queryFn: () =>
      getPainel({
        ...(turnoFiltro !== 'TODOS' ? { turno: turnoFiltro } : {}),
        ...(dataFiltro ? { data: dataFiltro } : {}),
      }),
    staleTime: 5_000,
  });

  // Subscreve WS para refresh em tempo real.
  useFarmaciaPainelWS({
    turno: turnoFiltro !== 'TODOS' ? turnoFiltro : undefined,
  });

  const separarMutation = useMutation({
    mutationFn: (d: Dispensacao) =>
      separarDispensacao(d.uuid, {
        itens: d.itens.map((i) => ({
          itemUuid: i.uuid,
          ...(i.lote ? { lote: i.lote } : {}),
          ...(i.validade ? { validade: i.validade } : {}),
        })),
      }),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Dispensação separada',
        description: 'Item segue para confirmação.',
      });
      void queryClient.invalidateQueries({
        queryKey: ['farmacia', 'painel'],
      });
    },
    onError: (err) => mutationToastError(err, 'Falha ao separar', showToast),
  });

  const dispensarMutation = useMutation({
    mutationFn: (d: Dispensacao) => dispensarDispensacao(d.uuid),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Dispensação confirmada',
        description: 'Conta atualizada e movimentação registrada.',
      });
      void queryClient.invalidateQueries({
        queryKey: ['farmacia', 'painel'],
      });
    },
    onError: (err) =>
      mutationToastError(err, 'Falha ao dispensar', showToast),
  });

  const devolverMutation = useMutation({
    mutationFn: ({
      uuid,
      input,
    }: {
      uuid: string;
      input: {
        motivoDevolucao: string;
        observacao?: string;
        itens: { itemOriginalUuid: string; quantidadeDevolvida: number }[];
      };
    }) => devolverDispensacao(uuid, input),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Devolução registrada',
        description: 'Estoque reabastecido e conta ajustada.',
      });
      setDevolverOpen(false);
      setDispensacaoAtiva(null);
      void queryClient.invalidateQueries({
        queryKey: ['farmacia', 'painel'],
      });
    },
    onError: (err) =>
      mutationToastError(err, 'Falha ao devolver', showToast),
  });

  const buckets = useMemo(() => {
    const all = painelQuery.data?.buckets ?? [];
    const byTurno = new Map<DispensacaoTurno, Dispensacao[]>(
      DISPENSACAO_TURNOS.map((t) => [t, [] as Dispensacao[]]),
    );
    for (const b of all) {
      const filtered = b.dispensacoes.filter((d) => statusFiltro.has(d.status));
      byTurno.set(b.turno, filtered);
    }
    return DISPENSACAO_TURNOS.map((t) => ({
      turno: t,
      dispensacoes: byTurno.get(t) ?? [],
    }));
  }, [painelQuery.data, statusFiltro]);

  function toggleStatus(s: DispensacaoStatus): void {
    setStatusFiltro((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  return (
    <section className="space-y-4" aria-label="Painel da farmácia">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Pill aria-hidden="true" className="h-6 w-6" />
            Painel da farmácia
          </h1>
          <p className="text-sm text-muted-foreground">
            Dispensações por turno em tempo real (RN-FAR-08).
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="filtro-data-painel">Data</Label>
            <Input
              id="filtro-data-painel"
              type="date"
              value={dataFiltro}
              onChange={(e) => setDataFiltro(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="filtro-turno-painel">Turno</Label>
            <Select
              id="filtro-turno-painel"
              value={turnoFiltro}
              onChange={(e) =>
                setTurnoFiltro(
                  e.target.value as 'TODOS' | DispensacaoTurno,
                )
              }
            >
              <option value="TODOS">Todos</option>
              {DISPENSACAO_TURNOS.map((t) => (
                <option key={t} value={t}>
                  {DISPENSACAO_TURNO_LABEL[t]}
                </option>
              ))}
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              queryClient.invalidateQueries({
                queryKey: ['farmacia', 'painel'],
              })
            }
            aria-label="Atualizar painel"
          >
            <RefreshCw aria-hidden="true" />
            Atualizar
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background p-2">
        <span className="mr-2 text-xs font-medium text-muted-foreground">
          Status:
        </span>
        {DISPENSACAO_STATUSES.map((s) => {
          const active = statusFiltro.has(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggleStatus(s)}
              aria-pressed={active}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-all',
                STATUS_BADGE[s],
                active ? 'ring-2 ring-offset-1 ring-foreground' : 'opacity-60',
              )}
            >
              {DISPENSACAO_STATUS_LABEL[s]}
            </button>
          );
        })}
      </div>

      {painelQuery.isLoading ? (
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          Carregando painel...
        </p>
      ) : null}

      {painelQuery.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Falha ao carregar painel da farmácia.
        </p>
      ) : null}

      <div
        role="list"
        aria-label="Colunas de turnos"
        className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"
      >
        {buckets.map(({ turno, dispensacoes }) => (
          <TurnoColumn
            key={turno}
            turno={turno}
            dispensacoes={dispensacoes}
            onSeparar={(d) => separarMutation.mutate(d)}
            onDispensar={(d) => dispensarMutation.mutate(d)}
            onDevolver={(d) => {
              setDispensacaoAtiva(d);
              setDevolverOpen(true);
            }}
            separandoUuid={
              separarMutation.isPending
                ? separarMutation.variables?.uuid
                : undefined
            }
            dispensandoUuid={
              dispensarMutation.isPending
                ? dispensarMutation.variables?.uuid
                : undefined
            }
          />
        ))}
      </div>

      <DevolverDialog
        open={devolverOpen}
        dispensacao={dispensacaoAtiva}
        onOpenChange={(o) => {
          setDevolverOpen(o);
          if (!o) setDispensacaoAtiva(null);
        }}
        onConfirm={(input) =>
          dispensacaoAtiva
            ? devolverMutation.mutate({
                uuid: dispensacaoAtiva.uuid,
                input,
              })
            : undefined
        }
        pending={devolverMutation.isPending}
      />
    </section>
  );
}

interface TurnoColumnProps {
  turno: DispensacaoTurno;
  dispensacoes: Dispensacao[];
  onSeparar: (d: Dispensacao) => void;
  onDispensar: (d: Dispensacao) => void;
  onDevolver: (d: Dispensacao) => void;
  separandoUuid?: string;
  dispensandoUuid?: string;
}

function TurnoColumn({
  turno,
  dispensacoes,
  onSeparar,
  onDispensar,
  onDevolver,
  separandoUuid,
  dispensandoUuid,
}: TurnoColumnProps): JSX.Element {
  const Icon = TURNO_ICON[turno];
  return (
    <Card role="listitem" data-testid={`coluna-${turno}`} className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <Icon aria-hidden="true" className="h-4 w-4" />
            {DISPENSACAO_TURNO_LABEL[turno]}
          </span>
          <span className="rounded-full border bg-muted/50 px-2 py-0.5 text-[11px] font-normal">
            {dispensacoes.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 space-y-2">
        {dispensacoes.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Nenhuma dispensação no turno.
          </p>
        ) : (
          dispensacoes.map((d) => (
            <DispensacaoCard
              key={d.uuid}
              dispensacao={d}
              onSeparar={() => onSeparar(d)}
              onDispensar={() => onDispensar(d)}
              onDevolver={() => onDevolver(d)}
              separando={separandoUuid === d.uuid}
              dispensando={dispensandoUuid === d.uuid}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

interface DispensacaoCardProps {
  dispensacao: Dispensacao;
  onSeparar: () => void;
  onDispensar: () => void;
  onDevolver: () => void;
  separando: boolean;
  dispensando: boolean;
}

function DispensacaoCard({
  dispensacao,
  onSeparar,
  onDispensar,
  onDevolver,
  separando,
  dispensando,
}: DispensacaoCardProps): JSX.Element {
  const totalItens = dispensacao.itens.length;
  return (
    <article
      data-testid={`dispensacao-${dispensacao.uuid}`}
      data-status={dispensacao.status}
      className="rounded-md border bg-background p-3 text-xs shadow-sm"
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {dispensacao.pacienteNome ?? '—'}
            {dispensacao.leitoCodigo ? (
              <span className="ml-2 rounded bg-muted px-1 text-[10px] uppercase">
                {dispensacao.leitoCodigo}
              </span>
            ) : null}
          </p>
          <p className="text-[11px] text-muted-foreground">
            <Clock
              aria-hidden="true"
              className="mr-1 inline-block h-3 w-3 align-text-bottom"
            />
            {formatDateTime(dispensacao.dataHora)} · {dispensacao.tipo}
          </p>
        </div>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
            STATUS_BADGE[dispensacao.status],
          )}
        >
          {DISPENSACAO_STATUS_LABEL[dispensacao.status]}
        </span>
      </header>

      <ul className="mt-2 space-y-1">
        {dispensacao.itens.slice(0, 3).map((item) => (
          <li
            key={item.uuid}
            className="flex items-baseline justify-between gap-2 border-l-2 border-muted pl-2"
          >
            <span className="truncate">
              {item.procedimentoNome ?? item.procedimentoUuid}
            </span>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {item.quantidadeDispensada} {item.unidadeMedida ?? ''}
              {item.lote ? ` · lote ${item.lote}` : ''}
            </span>
          </li>
        ))}
        {totalItens > 3 ? (
          <li className="text-[10px] text-muted-foreground">
            + {totalItens - 3} item(ns)
          </li>
        ) : null}
      </ul>

      <footer className="mt-3 flex items-center justify-between gap-2 border-t pt-2 text-[10px] text-muted-foreground">
        <div className="min-w-0 flex-1 space-y-0.5">
          {dispensacao.prescritorNome ? (
            <p className="truncate">
              <span className="font-medium">Prescr.:</span>{' '}
              {dispensacao.prescritorNome}
            </p>
          ) : null}
          {dispensacao.farmaceuticoNome ? (
            <p className="truncate">
              <span className="font-medium">Farm.:</span>{' '}
              {dispensacao.farmaceuticoNome}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-1">
          {dispensacao.status === 'PENDENTE' ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onSeparar}
              disabled={separando}
            >
              {separando ? (
                <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
              ) : (
                <Check aria-hidden="true" />
              )}
              Separar
            </Button>
          ) : null}
          {(dispensacao.status === 'SEPARADA' ||
            dispensacao.status === 'PENDENTE') ? (
            <Button
              type="button"
              size="sm"
              onClick={onDispensar}
              disabled={dispensando}
            >
              {dispensando ? (
                <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
              ) : (
                <Check aria-hidden="true" />
              )}
              Dispensar
            </Button>
          ) : null}
          {dispensacao.status === 'DISPENSADA' ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onDevolver}
            >
              <RotateCcw aria-hidden="true" />
              Devolver
            </Button>
          ) : null}
        </div>
      </footer>
    </article>
  );
}

interface DevolverDialogProps {
  open: boolean;
  dispensacao: Dispensacao | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: {
    motivoDevolucao: string;
    observacao?: string;
    itens: { itemOriginalUuid: string; quantidadeDevolvida: number }[];
  }) => void;
  pending: boolean;
}

function DevolverDialog({
  open,
  dispensacao,
  onOpenChange,
  onConfirm,
  pending,
}: DevolverDialogProps): JSX.Element | null {
  const [motivo, setMotivo] = useState('');
  const [observacao, setObservacao] = useState('');
  const [quantidades, setQuantidades] = useState<Record<string, string>>({});

  if (!dispensacao) return null;

  function handleSubmit(): void {
    if (!dispensacao) return;
    if (motivo.trim().length < 5) {
      return;
    }
    const itens = dispensacao.itens
      .map((i) => ({
        itemOriginalUuid: i.uuid,
        quantidadeDevolvida: Number(
          quantidades[i.uuid] ?? i.quantidadeDispensada,
        ),
      }))
      .filter((i) => Number.isFinite(i.quantidadeDevolvida) && i.quantidadeDevolvida > 0);
    if (itens.length === 0) return;
    onConfirm({
      motivoDevolucao: motivo.trim(),
      observacao: observacao.trim() || undefined,
      itens,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Devolver dispensação</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-md border bg-muted/40 p-2 text-xs">
            <p>
              <strong>Paciente:</strong> {dispensacao.pacienteNome ?? '—'}
            </p>
            <p>
              <strong>Data:</strong> {formatDateTime(dispensacao.dataHora)}
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="dev-motivo">Motivo da devolução *</Label>
            <Textarea
              id="dev-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              minLength={5}
              required
              placeholder="Ex.: paciente alta antes do uso"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="dev-obs">Observação</Label>
            <Textarea
              id="dev-obs"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </div>

          <div className="space-y-2 rounded-md border p-2">
            <p className="text-xs font-medium">Itens</p>
            <ul className="space-y-1 text-xs">
              {dispensacao.itens.map((i) => (
                <li
                  key={i.uuid}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="truncate">
                    {i.procedimentoNome ?? i.procedimentoUuid}
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max={i.quantidadeDispensada}
                    defaultValue={i.quantidadeDispensada}
                    onChange={(e) =>
                      setQuantidades((prev) => ({
                        ...prev,
                        [i.uuid]: e.target.value,
                      }))
                    }
                    className="h-8 w-20 text-xs"
                    aria-label={`Quantidade a devolver de ${
                      i.procedimentoNome ?? i.procedimentoUuid
                    }`}
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={pending || motivo.trim().length < 5}
          >
            {pending ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw aria-hidden="true" />
            )}
            Confirmar devolução
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function mutationToastError(
  err: unknown,
  fallbackTitle: string,
  showToast: ReturnType<typeof useToast>['show'],
): void {
  const detail =
    err instanceof ApiError
      ? err.detail ?? err.title ?? err.message
      : err instanceof Error
        ? err.message
        : 'Erro inesperado.';
  showToast({
    variant: 'destructive',
    title: fallbackTitle,
    description: detail,
  });
}

PainelFarmaciaPage.displayName = 'PainelFarmaciaPage';
