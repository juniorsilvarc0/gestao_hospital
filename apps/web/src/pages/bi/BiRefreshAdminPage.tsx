/**
 * BiRefreshAdminPage — administra o refresh das materialized views.
 *
 *  - Botão "Forçar refresh agora" → POST /v1/bi/refresh.
 *    Mostra spinner e exibe a tabela com o resultado por view (status,
 *    duração, linhas, erro). O endpoint é síncrono em P0 — retorna o
 *    relatório completo.
 *  - Tabela "Log de execuções" — GET /v1/bi/refresh/log paginado.
 *  - Header com indicação de "última execução" via /v1/bi/refresh/status.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCcw,
  XCircle,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import { useToast } from '@/components/Toast';
import {
  forceRefresh,
  getRefreshStatus,
  listRefreshLog,
  type ForceRefreshReport,
} from '@/lib/bi-api';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}

function formatDuration(ms?: number | null): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('pt-BR');
}

export function BiRefreshAdminPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();
  const [report, setReport] = useState<ForceRefreshReport | null>(null);
  const [page, setPage] = useState<number>(1);

  const statusQuery = useQuery({
    queryKey: ['bi', 'refresh-status'],
    queryFn: () => getRefreshStatus(),
    staleTime: 30_000,
  });

  const logQuery = useQuery({
    queryKey: ['bi', 'refresh-log', page],
    queryFn: () => listRefreshLog({ page, pageSize: PAGE_SIZE }),
    staleTime: 30_000,
  });

  const refreshMutation = useMutation({
    mutationFn: () => forceRefresh({}),
    onSuccess: (data) => {
      setReport(data);
      void queryClient.invalidateQueries({ queryKey: ['bi', 'refresh-status'] });
      void queryClient.invalidateQueries({ queryKey: ['bi', 'refresh-log'] });
      showToast({
        title: 'Refresh concluído',
        description: `${data?.ok ?? 0} OK · ${data?.erro ?? 0} erro(s)`,
        durationMs: 3000,
      });
    },
    onError: (err) => {
      const detail = err instanceof Error ? err.message : 'Erro desconhecido';
      showToast({
        title: 'Falha no refresh',
        description: detail,
        durationMs: 4500,
      });
    },
  });

  const ultimaExecucao = statusQuery.data?.ultimaExecucao;

  const logRows = logQuery.data?.data ?? [];
  const meta = logQuery.data?.meta;
  const totalPages = meta?.totalPages ?? 1;

  return (
    <section className="space-y-4" aria-label="Administração de refresh BI">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <RefreshCcw aria-hidden="true" className="h-6 w-6" />
            Refresh BI (admin)
          </h1>
          <p className="text-sm text-muted-foreground">
            Atualização das materialized views do schema <code>reporting</code>.
          </p>
        </div>
        <Button
          type="button"
          disabled={refreshMutation.isPending}
          onClick={() => refreshMutation.mutate()}
          data-testid="forcar-refresh"
        >
          {refreshMutation.isPending ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <RefreshCcw aria-hidden="true" />
          )}
          Forçar refresh agora
        </Button>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Última execução</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 pt-1 text-sm">
          {statusQuery.isLoading ? (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              Carregando status...
            </p>
          ) : ultimaExecucao ? (
            <>
              <p>
                <span className="text-muted-foreground">Início:</span>{' '}
                <span className="tabular-nums">
                  {formatDateTime(ultimaExecucao.iniciadoEm)}
                </span>
              </p>
              <p>
                <span className="text-muted-foreground">Status:</span>{' '}
                <span
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-xs font-medium',
                    ultimaExecucao.statusGeral === 'OK'
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                      : ultimaExecucao.statusGeral === 'ERRO'
                        ? 'border-red-300 bg-red-50 text-red-900'
                        : 'border-amber-300 bg-amber-50 text-amber-900',
                  )}
                >
                  {ultimaExecucao.statusGeral}
                </span>
              </p>
              <p className="text-muted-foreground">
                Total: {ultimaExecucao.total} · OK: {ultimaExecucao.ok} · Erro:{' '}
                {ultimaExecucao.erro}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">Sem execução registrada.</p>
          )}
        </CardContent>
      </Card>

      {report ? (
        <Card data-testid="refresh-report">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Relatório do refresh (
              {report.ok ?? 0} OK · {report.erro ?? 0} erro
              {report.erro === 1 ? '' : 's'})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">View</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-right font-medium">Duração</th>
                    <th className="px-3 py-2 text-right font-medium">Linhas</th>
                    <th className="px-3 py-2 text-left font-medium">Erro</th>
                  </tr>
                </thead>
                <tbody>
                  {(report.views ?? []).map((v) => (
                    <tr key={v.viewName} className="border-t">
                      <td className="px-3 py-2 font-mono text-xs">{v.viewName}</td>
                      <td className="px-3 py-2">
                        {v.status === 'OK' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                            OK
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-700">
                            <XCircle aria-hidden="true" className="h-4 w-4" />
                            ERRO
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatDuration(v.duracaoMs)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatNumber(v.linhas ?? null)}
                      </td>
                      <td className="px-3 py-2 text-xs text-red-700">
                        {v.erro ?? ''}
                      </td>
                    </tr>
                  ))}
                  {!report.views || report.views.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-3 py-4 text-center text-sm text-muted-foreground"
                      >
                        Sem detalhes por view.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm">Log de execuções</CardTitle>
          {meta ? (
            <p className="text-xs text-muted-foreground">
              Página {meta.page} de {meta.totalPages} · {meta.total} registros
            </p>
          ) : null}
        </CardHeader>
        <CardContent>
          <div className="rounded-md border" data-testid="refresh-log">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">View</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Início</th>
                  <th className="px-3 py-2 text-right font-medium">Duração</th>
                  <th className="px-3 py-2 text-right font-medium">Linhas</th>
                  <th className="px-3 py-2 text-left font-medium">Origem</th>
                  <th className="px-3 py-2 text-left font-medium">Erro</th>
                </tr>
              </thead>
              <tbody>
                {logQuery.isLoading ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-4 text-center text-sm text-muted-foreground"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Loader2
                          aria-hidden="true"
                          className="h-4 w-4 animate-spin"
                        />
                        Carregando log...
                      </span>
                    </td>
                  </tr>
                ) : logRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-4 text-center text-sm text-muted-foreground"
                    >
                      Sem registros.
                    </td>
                  </tr>
                ) : (
                  logRows.map((row) => (
                    <tr key={row.uuid} className="border-t">
                      <td className="px-3 py-2 font-mono text-xs">{row.view}</td>
                      <td className="px-3 py-2">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-3 py-2 tabular-nums text-xs">
                        {formatDateTime(row.iniciadoEm)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatDuration(row.duracaoMs ?? null)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatNumber(row.linhasProcessadas ?? null)}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {/* `triggerOrigem` não está em `BiRefreshExecucao`, mas backend pode incluir */}
                        {(row as unknown as { triggerOrigem?: string | null })
                          .triggerOrigem ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-red-700">
                        {row.erro ?? ''}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1 || logQuery.isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft aria-hidden="true" />
              Anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages || logQuery.isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {refreshMutation.isError ? (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          <AlertCircle aria-hidden="true" className="h-4 w-4" />
          Falha ao executar refresh — confira o log para detalhes.
        </p>
      ) : null}
    </section>
  );
}

BiRefreshAdminPage.displayName = 'BiRefreshAdminPage';

function StatusBadge({ status }: { status: string }): JSX.Element {
  const cls =
    status === 'OK'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
      : status === 'EM_ANDAMENTO'
        ? 'border-blue-300 bg-blue-50 text-blue-900'
        : 'border-red-300 bg-red-50 text-red-900';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
        cls,
      )}
    >
      {status}
    </span>
  );
}
