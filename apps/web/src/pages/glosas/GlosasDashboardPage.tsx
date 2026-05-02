/**
 * GlosasDashboardPage — Painel de KPIs de glosas + lista de prazos.
 *
 * Cards: total recebidas / em recurso / revertidas / acatadas / perda
 *        definitiva · valor glosado · valor revertido · taxa de reversão.
 * Lista: glosas com prazo D-7 / D-3 / D-0 / vencido (links).
 */
import { useNavigate } from 'react-router-dom';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileWarning,
  Gauge,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import { getDashboardGlosas, listGlosas } from '@/lib/glosas-api';
import {
  GLOSA_STATUS_BADGE,
  GLOSA_STATUS_LABEL,
  type Glosa,
  type GlosasDashboard,
  type PaginatedGlosas,
} from '@/types/glosas';
import { cn } from '@/lib/utils';

function formatMoney(raw: string | null): string {
  if (!raw) return '—';
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function formatBR(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

const PRAZO_QUERIES: { key: 'D7' | 'D3' | 'D0' | 'VENCIDO'; label: string; icon: typeof Clock; color: string }[] = [
  { key: 'D7', label: '≤ 7 dias', icon: Clock, color: 'border-amber-300' },
  { key: 'D3', label: '≤ 3 dias', icon: AlertTriangle, color: 'border-orange-300' },
  { key: 'D0', label: 'Vence hoje', icon: AlertCircle, color: 'border-orange-500' },
  { key: 'VENCIDO', label: 'Vencidas', icon: AlertCircle, color: 'border-red-400' },
];

export function GlosasDashboardPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const queries = useQueries({
    queries: [
      {
        queryKey: ['glosas', 'dashboard'],
        queryFn: () => getDashboardGlosas(),
        staleTime: 30_000,
      },
      ...PRAZO_QUERIES.map((p) => ({
        queryKey: ['glosas', 'prazo', p.key],
        queryFn: () => listGlosas({ prazoVencido: p.key, pageSize: 5 }),
        staleTime: 30_000,
      })),
    ],
  });

  const dashboard = queries[0].data as GlosasDashboard | undefined;
  const isLoading = queries.some((q) => q.isLoading);

  function refreshAll(): void {
    void queryClient.invalidateQueries({ queryKey: ['glosas', 'dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['glosas', 'prazo'] });
  }

  return (
    <section className="space-y-4" aria-label="Painel de glosas">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Gauge aria-hidden="true" className="h-6 w-6" />
            Painel de Glosas
          </h1>
          <p className="text-sm text-muted-foreground">
            KPIs do ciclo de glosas e fila de prazos críticos.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={refreshAll}>
          <RefreshCw aria-hidden="true" />
          Atualizar
        </Button>
      </header>

      {isLoading ? (
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          Carregando KPIs...
        </p>
      ) : null}

      {dashboard ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <KpiCard
              label="Recebidas"
              value={dashboard.totalRecebidas}
              icon={FileWarning}
            />
            <KpiCard
              label="Em recurso"
              value={dashboard.totalEmRecurso}
              icon={Clock}
            />
            <KpiCard
              label="Revertidas"
              value={dashboard.totalRevertidas}
              icon={CheckCircle2}
              color="text-emerald-700"
            />
            <KpiCard
              label="Acatadas"
              value={dashboard.totalAcatadas}
              icon={AlertTriangle}
            />
            <KpiCard
              label="Perda definitiva"
              value={dashboard.totalPerdaDefinitiva}
              icon={AlertCircle}
              color="text-red-700"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Valor glosado total
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-1">
                <p className="text-lg font-semibold tabular-nums text-orange-700">
                  {formatMoney(dashboard.valorTotalGlosado)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Valor revertido
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-1">
                <p className="text-lg font-semibold tabular-nums text-emerald-700">
                  {formatMoney(dashboard.valorTotalRevertido)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Taxa de reversão
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-1">
                <p className="text-lg font-semibold tabular-nums">
                  {dashboard.taxaReversao}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <PrazoCounter
              label="≤ 7 dias"
              count={dashboard.prazos.d7}
              color="bg-amber-100 text-amber-900 border-amber-300"
            />
            <PrazoCounter
              label="≤ 3 dias"
              count={dashboard.prazos.d3}
              color="bg-orange-100 text-orange-900 border-orange-300"
            />
            <PrazoCounter
              label="Vence hoje"
              count={dashboard.prazos.d0}
              color="bg-orange-200 text-orange-950 border-orange-400"
            />
            <PrazoCounter
              label="Vencidas"
              count={dashboard.prazos.vencido}
              color="bg-red-100 text-red-900 border-red-300"
            />
          </div>
        </>
      ) : null}

      <h2 className="text-lg font-semibold tracking-tight">
        Fila de prazos críticos
      </h2>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {PRAZO_QUERIES.map((p, idx) => {
          const q = queries[idx + 1];
          const data = q?.data as PaginatedGlosas | undefined;
          const linhas: Glosa[] = data?.data ?? [];
          const Icon = p.icon;
          return (
            <Card
              key={p.key}
              data-testid={`prazo-${p.key}`}
              className={cn('border-2', p.color)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Icon aria-hidden="true" className="h-4 w-4" />
                  Prazo {p.label}
                  <span className="ml-auto rounded-full border bg-muted/50 px-2 py-0.5 text-[11px] font-normal">
                    {linhas.length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {linhas.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">
                    Sem glosas neste corte.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {linhas.map((g) => (
                      <li
                        key={g.uuid}
                        className="flex items-center justify-between gap-2 rounded-md border bg-background p-2 text-xs"
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <p className="truncate font-medium">
                            {g.contaNumero} · {formatMoney(g.valorGlosado)}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {g.convenioNome ?? g.convenioUuid} · prazo{' '}
                            {formatBR(g.prazoRecurso)}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                            GLOSA_STATUS_BADGE[g.status],
                          )}
                        >
                          {GLOSA_STATUS_LABEL[g.status]}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/glosas/${g.uuid}`)}
                        >
                          Abrir
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

interface KpiCardProps {
  label: string;
  value: number;
  icon: typeof Clock;
  color?: string;
}

function KpiCard({ label, value, icon: Icon, color }: KpiCardProps): JSX.Element {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-1">
        <CardTitle className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
        <Icon aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="pt-1">
        <p className={cn('text-2xl font-semibold tabular-nums', color)}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function PrazoCounter({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}): JSX.Element {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 rounded-md border p-3 text-sm',
        color,
      )}
    >
      <span className="font-medium">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{count}</span>
    </div>
  );
}

GlosasDashboardPage.displayName = 'GlosasDashboardPage';
