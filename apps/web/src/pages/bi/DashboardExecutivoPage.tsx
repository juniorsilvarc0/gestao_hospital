/**
 * DashboardExecutivoPage — KPIs gerenciais por competência.
 *
 * Header: seletor de competência (`<input type="month">`).
 * Body: 8 KPI cards (pacientes, cirurgias, ocupação, permanência,
 *       mortalidade, IRAS, faturamento líquido, glosa%) +
 *       4 sparklines (ocupação, faturamento, glosa%, mortalidade).
 * Footer: atalhos para os 3 dashboards de indicadores especializados.
 *
 * O backend (R-A) retorna o payload `DashboardExecutivoResponse` com
 * `resumo` (KPIs do mês) e `tendencias[]` (até 6 competências em ordem
 * cronológica). Como o schema pode evoluir, lemos campos de forma
 * defensiva (`pickNumber`, `pickString`).
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  Bed,
  BarChart3,
  CalendarDays,
  ChevronRight,
  DollarSign,
  Gauge,
  HeartPulse,
  Loader2,
  Percent,
  RefreshCw,
  ShieldAlert,
  Stethoscope,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@/components/ui';
import { getDashboardExecutivo } from '@/lib/bi-api';
import { cn } from '@/lib/utils';
import { Sparkline } from './Sparkline';

function defaultCompetencia(): string {
  // Default: mês corrente. `<input type="month">` aceita YYYY-MM.
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function pickFromPath(
  source: unknown,
  path: string[],
): unknown {
  let curr: unknown = source;
  for (const seg of path) {
    if (!isObj(curr)) return undefined;
    curr = curr[seg];
  }
  return curr;
}

function pickNumber(source: unknown, ...paths: string[][]): number | null {
  for (const p of paths) {
    const raw = pickFromPath(source, p);
    if (raw === null || raw === undefined) continue;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    if (typeof raw === 'string') {
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function pickString(source: unknown, ...paths: string[][]): string | null {
  for (const p of paths) {
    const raw = pickFromPath(source, p);
    if (typeof raw === 'string' && raw.length > 0) return raw;
    if (typeof raw === 'number') return String(raw);
  }
  return null;
}

function formatNumber(value: number | null): string {
  if (value === null) return '—';
  return value.toLocaleString('pt-BR');
}

function formatPercent(raw: string | number | null): string {
  if (raw === null) return '—';
  const n = typeof raw === 'string' ? Number(raw) : raw;
  if (!Number.isFinite(n)) return typeof raw === 'string' ? raw : '—';
  return `${n.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })}%`;
}

function formatMoney(raw: string | number | null): string {
  if (raw === null) return '—';
  const n = typeof raw === 'string' ? Number(raw) : raw;
  if (!Number.isFinite(n)) return typeof raw === 'string' ? raw : '—';
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

function formatDays(raw: string | number | null): string {
  if (raw === null) return '—';
  const n = typeof raw === 'string' ? Number(raw) : raw;
  if (!Number.isFinite(n)) return typeof raw === 'string' ? raw : '—';
  return `${n.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} d`;
}

interface KpiCardProps {
  label: string;
  value: string;
  icon: typeof Users;
  hint?: string;
  color?: string;
  testId?: string;
}

function KpiCard({ label, value, icon: Icon, hint, color, testId }: KpiCardProps): JSX.Element {
  return (
    <Card data-testid={testId}>
      <CardHeader className="flex flex-row items-center justify-between pb-1">
        <CardTitle className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
        <Icon aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="pt-1">
        <p className={cn('text-2xl font-semibold tabular-nums', color)}>{value}</p>
        {hint ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

interface ShortcutCardProps {
  to: string;
  label: string;
  description: string;
  icon: typeof Users;
}

function ShortcutCard({ to, label, description, icon: Icon }: ShortcutCardProps): JSX.Element {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-lg border bg-background p-4 transition-colors hover:bg-accent/40"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon aria-hidden="true" className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{label}</p>
        <p className="truncate text-xs text-muted-foreground">{description}</p>
      </div>
      <ChevronRight
        aria-hidden="true"
        className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}

export function DashboardExecutivoPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [competencia, setCompetencia] = useState<string>(defaultCompetencia);

  const query = useQuery({
    queryKey: ['bi', 'dashboard-executivo', competencia],
    queryFn: () => getDashboardExecutivo({ competencia }),
    staleTime: 60_000,
  });

  function refresh(): void {
    void queryClient.invalidateQueries({
      queryKey: ['bi', 'dashboard-executivo'],
    });
  }

  // Extrai os 8 KPIs com tolerância a variação de schema.
  const data = query.data;
  const pacientes = pickNumber(
    data,
    ['resumo', 'pacientesAtendidos'],
    ['kpis', 'pacientesAtendidos'],
  );
  const cirurgias = pickNumber(
    data,
    ['resumo', 'cirurgiasRealizadas'],
    ['kpis', 'cirurgias'],
  );
  const taxaOcupacao = pickString(
    data,
    ['resumo', 'taxaOcupacaoPct'],
    ['kpis', 'taxaOcupacao'],
  );
  const permanencia = pickString(
    data,
    ['resumo', 'permanenciaMediaDias'],
    ['kpis', 'permanenciaMedia'],
  );
  const mortalidade = pickString(
    data,
    ['resumo', 'mortalidadePct'],
    ['kpis', 'mortalidade'],
  );
  const irasTaxa = pickString(
    data,
    ['resumo', 'iras', 'taxaPor1000PacienteDias'],
    ['kpis', 'iras'],
  );
  const irasCasos = pickNumber(
    data,
    ['resumo', 'iras', 'totalCasos'],
  );
  const faturamentoLiquido = pickString(
    data,
    ['resumo', 'faturamento', 'liquido'],
    ['kpis', 'faturamentoLiquido'],
  );
  const glosaPct = pickString(
    data,
    ['resumo', 'faturamento', 'glosaPct'],
    ['kpis', 'glosaPercentual'],
  );

  // Extrai séries para sparklines a partir de `tendencias[]`.
  const tendencias = useMemo<Array<Record<string, unknown>>>(() => {
    const t = pickFromPath(data, ['tendencias']);
    if (Array.isArray(t)) return t.filter(isObj);
    return [];
  }, [data]);

  const seriesOcupacao = useMemo(
    () =>
      tendencias
        .map((row) => Number(row['ocupacaoPct'] ?? row['valor']))
        .filter((n) => Number.isFinite(n)),
    [tendencias],
  );
  const seriesFaturamento = useMemo(
    () =>
      tendencias
        .map((row) => Number(row['faturamentoBruto'] ?? row['valor']))
        .filter((n) => Number.isFinite(n)),
    [tendencias],
  );
  const seriesGlosa = useMemo(
    () =>
      tendencias
        .map((row) => Number(row['glosaPct'] ?? row['valor']))
        .filter((n) => Number.isFinite(n)),
    [tendencias],
  );
  const seriesMortalidade = useMemo(
    () =>
      tendencias
        .map((row) => Number(row['mortalidadePct'] ?? row['valor']))
        .filter((n) => Number.isFinite(n)),
    [tendencias],
  );

  return (
    <section className="space-y-4" aria-label="Dashboard executivo">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <BarChart3 aria-hidden="true" className="h-6 w-6" />
            Dashboard executivo
          </h1>
          <p className="text-sm text-muted-foreground">
            Visão consolidada da competência: KPIs assistenciais e financeiros.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label htmlFor="competencia" className="text-xs">
              Competência
            </Label>
            <Input
              id="competencia"
              type="month"
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
              className="w-40"
            />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={refresh}>
            <RefreshCw aria-hidden="true" />
            Atualizar
          </Button>
        </div>
      </header>

      {query.isLoading ? (
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          Carregando KPIs...
        </p>
      ) : null}

      {query.isError ? (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          <AlertCircle aria-hidden="true" className="h-4 w-4" />
          Falha ao carregar o dashboard executivo.
        </p>
      ) : null}

      <div
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        data-testid="kpi-grid"
      >
        <KpiCard
          label="Pacientes"
          value={formatNumber(pacientes)}
          icon={Users}
          testId="kpi-pacientes"
        />
        <KpiCard
          label="Cirurgias"
          value={formatNumber(cirurgias)}
          icon={Stethoscope}
          testId="kpi-cirurgias"
        />
        <KpiCard
          label="Ocupação"
          value={formatPercent(taxaOcupacao)}
          icon={Bed}
          testId="kpi-ocupacao"
        />
        <KpiCard
          label="Permanência"
          value={formatDays(permanencia)}
          icon={CalendarDays}
          testId="kpi-permanencia"
        />
        <KpiCard
          label="Mortalidade"
          value={formatPercent(mortalidade)}
          icon={HeartPulse}
          color="text-red-700"
          testId="kpi-mortalidade"
        />
        <KpiCard
          label="IRAS / 1000 pac-dias"
          value={formatPercent(irasTaxa)}
          icon={ShieldAlert}
          hint={
            irasCasos !== null
              ? `${formatNumber(irasCasos)} casos no período`
              : undefined
          }
          testId="kpi-iras"
        />
        <KpiCard
          label="Faturamento líquido"
          value={formatMoney(faturamentoLiquido)}
          icon={DollarSign}
          color="text-emerald-700"
          testId="kpi-faturamento"
        />
        <KpiCard
          label="Glosa %"
          value={formatPercent(glosaPct)}
          icon={Percent}
          color="text-orange-700"
          testId="kpi-glosa"
        />
      </div>

      <h2 className="text-lg font-semibold tracking-tight">
        Tendência (últimas 6 competências)
      </h2>
      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        data-testid="sparkline-grid"
      >
        <SparklineCard label="Ocupação %" data={seriesOcupacao} color="#0ea5e9" />
        <SparklineCard
          label="Faturamento"
          data={seriesFaturamento}
          color="#10b981"
        />
        <SparklineCard label="Glosa %" data={seriesGlosa} color="#f59e0b" />
        <SparklineCard
          label="Mortalidade %"
          data={seriesMortalidade}
          color="#ef4444"
        />
      </div>

      <h2 className="text-lg font-semibold tracking-tight">
        Aprofundar nos indicadores
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ShortcutCard
          to="/bi/assistencial"
          label="Assistenciais"
          description="Ocupação, permanência, mortalidade, IRAS"
          icon={HeartPulse}
        />
        <ShortcutCard
          to="/bi/financeiro"
          label="Financeiros"
          description="Faturamento, glosas, repasse"
          icon={TrendingUp}
        />
        <ShortcutCard
          to="/bi/operacionais"
          label="Operacionais"
          description="No-show, classificação, cirurgias por sala"
          icon={Gauge}
        />
      </div>
    </section>
  );
}

DashboardExecutivoPage.displayName = 'DashboardExecutivoPage';

interface SparklineCardProps {
  label: string;
  data: number[];
  color: string;
}

function SparklineCard({ label, data, color }: SparklineCardProps): JSX.Element {
  const last = data.length > 0 ? data[data.length - 1] : null;
  const first = data.length > 0 ? data[0] : null;
  const delta =
    last !== null && first !== null && first !== 0
      ? ((last - first) / Math.abs(first)) * 100
      : null;

  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
          {delta !== null ? (
            <span
              className={cn(
                'text-[10px] font-medium',
                delta >= 0 ? 'text-emerald-700' : 'text-red-700',
              )}
            >
              {delta >= 0 ? '+' : ''}
              {delta.toFixed(1)}%
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-1">
        <Sparkline data={data} color={color} ariaLabel={`${label} — série temporal`} />
        <p className="mt-1 text-[11px] text-muted-foreground">
          {data.length} pontos
        </p>
      </CardContent>
    </Card>
  );
}
