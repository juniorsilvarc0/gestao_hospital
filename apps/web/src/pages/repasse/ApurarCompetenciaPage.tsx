/**
 * ApurarCompetenciaPage — enfileira a apuração de uma competência e mostra
 * o progresso via polling do `/repasse/apurar/{jobId}/status`.
 *
 * Form mínimo:
 *   - competencia (YYYY-MM)
 *   - prestadorUuids (lista opcional, separada por vírgula)
 *   - forceReapuracao (checkbox)
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Calculator,
  CheckCircle2,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { apurar, getJobStatus } from '@/lib/repasse-api';
import { useToast } from '@/components/Toast';
import type {
  ApuracaoJobStatus,
  ApurarInput,
  ApurarJobStatus,
} from '@/types/repasse';

const STATUS_FINAIS: ApuracaoJobStatus[] = ['COMPLETED', 'FAILED', 'NOT_FOUND'];

const STATUS_LABEL: Record<ApuracaoJobStatus, string> = {
  WAITING: 'Aguardando worker',
  ACTIVE: 'Em execução',
  COMPLETED: 'Concluído',
  FAILED: 'Falhou',
  DELAYED: 'Atrasado',
  PAUSED: 'Pausado',
  STUCK: 'Travado',
  NOT_FOUND: 'Job não encontrado',
};

function formatMoney(raw: string | null | undefined): string {
  if (raw === null || raw === undefined || raw === '') return '—';
  const n = Number(raw);
  if (!Number.isFinite(n)) return String(raw);
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function toastErr(
  err: unknown,
  fallback: string,
  showToast: ReturnType<typeof useToast>['show'],
): void {
  const detail =
    err instanceof ApiError
      ? err.detail ?? err.title ?? err.message
      : err instanceof Error
        ? err.message
        : 'Erro.';
  showToast({ variant: 'destructive', title: fallback, description: detail });
}

export function ApurarCompetenciaPage(): JSX.Element {
  const navigate = useNavigate();
  const { show: showToast } = useToast();

  const [competencia, setCompetencia] = useState('');
  const [prestadores, setPrestadores] = useState('');
  const [forceReapuracao, setForceReapuracao] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  const apurarM = useMutation({
    mutationFn: (input: ApurarInput) => apurar(input),
    onSuccess: (result) => {
      setJobId(result.jobId);
      showToast({
        variant: 'info',
        title: 'Apuração enfileirada',
        description: `Job ${result.jobId} aguardando worker.`,
      });
    },
    onError: (e) => toastErr(e, 'Falha ao enfileirar apuração', showToast),
  });

  const statusQuery = useQuery<ApurarJobStatus>({
    queryKey: ['repasse', 'job', jobId],
    queryFn: () => getJobStatus(jobId as string),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 2000;
      return STATUS_FINAIS.includes(data.status) ? false : 2000;
    },
    refetchIntervalInBackground: true,
  });

  // Notifica quando o job termina.
  useEffect(() => {
    const data = statusQuery.data;
    if (!data) return;
    if (data.status === 'COMPLETED') {
      showToast({
        variant: 'success',
        title: 'Apuração concluída',
        description: data.result
          ? `${data.result.totalRepasses} repasse(s) gerado(s).`
          : '',
      });
    } else if (data.status === 'FAILED') {
      showToast({
        variant: 'destructive',
        title: 'Apuração falhou',
        description: data.failedReason ?? '',
      });
    }
  }, [statusQuery.data, showToast]);

  const validCompetencia = /^\d{4}-\d{2}$/.test(competencia);
  const valid = validCompetencia;

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!valid) return;
    const list = prestadores
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    apurarM.mutate({
      competencia,
      ...(list.length > 0 ? { prestadorUuids: list } : {}),
      forceReapuracao,
    });
  }

  function reset(): void {
    setJobId(null);
  }

  const status = statusQuery.data?.status ?? null;
  const isFinal = status ? STATUS_FINAIS.includes(status) : false;
  const isCompleted = status === 'COMPLETED';
  const isFailed = status === 'FAILED' || status === 'NOT_FOUND';

  return (
    <section className="space-y-4" aria-label="Apurar competência">
      <header className="space-y-1">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="h-3 w-3" />
          Voltar
        </button>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Calculator aria-hidden="true" className="h-6 w-6" />
          Apurar competência
        </h1>
        <p className="text-sm text-muted-foreground">
          Enfileira a apuração de repasse para todos os prestadores ou para
          um subset. Status reflete o job BullMQ em tempo real.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Parâmetros</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="ap-comp">Competência (YYYY-MM) *</Label>
                <Input
                  id="ap-comp"
                  value={competencia}
                  onChange={(e) => setCompetencia(e.target.value)}
                  placeholder="2026-04"
                  pattern="^\d{4}-\d{2}$"
                  required
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={forceReapuracao}
                    onChange={(e) => setForceReapuracao(e.target.checked)}
                  />
                  Forçar reapuração de já existentes
                </label>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ap-prest">
                Prestadores (UUIDs separados por vírgula, opcional)
              </Label>
              <Textarea
                id="ap-prest"
                value={prestadores}
                onChange={(e) => setPrestadores(e.target.value)}
                rows={3}
                placeholder="uuid1, uuid2, uuid3"
              />
            </div>
            <div className="flex justify-end gap-2">
              {jobId ? (
                <Button type="button" variant="outline" onClick={reset}>
                  Nova apuração
                </Button>
              ) : null}
              <Button
                type="submit"
                disabled={!valid || apurarM.isPending || (jobId !== null && !isFinal)}
              >
                {apurarM.isPending ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : (
                  <Calculator aria-hidden="true" />
                )}
                Enfileirar apuração
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {jobId ? (
        <Card data-testid="apurar-status-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Progresso da apuração</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">Job ID</p>
              <p className="font-mono text-xs">{jobId}</p>
            </div>
            <div className="flex items-center gap-2">
              {!status || (!isFinal && status !== 'PAUSED') ? (
                <Loader2
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin text-muted-foreground"
                />
              ) : isCompleted ? (
                <CheckCircle2
                  aria-hidden="true"
                  className="h-4 w-4 text-emerald-700"
                />
              ) : isFailed ? (
                <XCircle aria-hidden="true" className="h-4 w-4 text-destructive" />
              ) : (
                <RefreshCw aria-hidden="true" className="h-4 w-4" />
              )}
              <span data-testid="apurar-status-label" className="font-medium">
                {status ? STATUS_LABEL[status] : 'Sincronizando...'}
              </span>
              {typeof statusQuery.data?.progress === 'number' ? (
                <span className="text-xs text-muted-foreground">
                  ({statusQuery.data.progress}%)
                </span>
              ) : null}
            </div>

            {isCompleted && statusQuery.data?.result ? (
              <div className="space-y-2 rounded-md border bg-muted/40 p-3">
                <p className="text-xs font-semibold">Resumo</p>
                <ul className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <li>
                    <p className="text-[10px] uppercase text-muted-foreground">
                      Repasses
                    </p>
                    <p className="font-medium tabular-nums">
                      {statusQuery.data.result.totalRepasses}
                    </p>
                  </li>
                  <li>
                    <p className="text-[10px] uppercase text-muted-foreground">
                      Prestadores
                    </p>
                    <p className="font-medium tabular-nums">
                      {statusQuery.data.result.totalPrestadores}
                    </p>
                  </li>
                  <li>
                    <p className="text-[10px] uppercase text-muted-foreground">
                      Bruto total
                    </p>
                    <p className="font-medium tabular-nums">
                      {formatMoney(statusQuery.data.result.valorBrutoTotal)}
                    </p>
                  </li>
                  <li>
                    <p className="text-[10px] uppercase text-muted-foreground">
                      Líquido total
                    </p>
                    <p className="font-medium tabular-nums">
                      {formatMoney(statusQuery.data.result.valorLiquidoTotal)}
                    </p>
                  </li>
                </ul>
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    navigate(`/repasse?competencia=${competencia}`)
                  }
                >
                  Ver repasses
                </Button>
              </div>
            ) : null}

            {isFailed && statusQuery.data?.failedReason ? (
              <p
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
              >
                {statusQuery.data.failedReason}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}

ApurarCompetenciaPage.displayName = 'ApurarCompetenciaPage';
