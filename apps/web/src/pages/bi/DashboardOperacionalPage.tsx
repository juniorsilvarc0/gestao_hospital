/**
 * DashboardOperacionalPage — visão de hoje + últimos 30 dias.
 *
 * Cards: Leitos · Agendamentos (no-show%) · Cirurgias · Fila com
 * distribuição Manchester (barras horizontais).
 *
 * O endpoint `/v1/bi/dashboards/operacional` recebe `dataInicio` /
 * `dataFim` (YYYY-MM-DD). Default: últimos 30 dias.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertCircle,
  Bed,
  Calendar,
  HeartPulse,
  Loader2,
  RefreshCw,
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
} from '@/components/ui';
import { getDashboardOperacional } from '@/lib/bi-api';
import { cn } from '@/lib/utils';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoNDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function pickFromPath(source: unknown, path: string[]): unknown {
  let curr: unknown = source;
  for (const seg of path) {
    if (!isObj(curr)) return undefined;
    curr = curr[seg];
  }
  return curr;
}

function pickNumber(source: unknown, path: string[]): number | null {
  const raw = pickFromPath(source, path);
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function pickString(source: unknown, path: string[]): string | null {
  const raw = pickFromPath(source, path);
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number') return String(raw);
  return null;
}

function formatNumber(value: number | null): string {
  if (value === null) return '—';
  return value.toLocaleString('pt-BR');
}

function formatPercent(raw: string | null): string {
  if (raw === null) return '—';
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return `${n.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })}%`;
}

const MANCHESTER_COLORS: Record<string, string> = {
  VERMELHO: 'bg-red-500',
  LARANJA: 'bg-orange-500',
  AMARELO: 'bg-yellow-400',
  VERDE: 'bg-emerald-500',
  AZUL: 'bg-blue-500',
};

const MANCHESTER_LABEL: Record<string, string> = {
  VERMELHO: 'Vermelho (emergência)',
  LARANJA: 'Laranja (muito urgente)',
  AMARELO: 'Amarelo (urgente)',
  VERDE: 'Verde (pouco urgente)',
  AZUL: 'Azul (não urgente)',
};

const MANCHESTER_ORDER = ['VERMELHO', 'LARANJA', 'AMARELO', 'VERDE', 'AZUL'];

export function DashboardOperacionalPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [dataInicio, setDataInicio] = useState<string>(() => isoNDaysAgo(30));
  const [dataFim, setDataFim] = useState<string>(() => todayIso());

  const query = useQuery({
    queryKey: ['bi', 'dashboard-operacional', dataInicio, dataFim],
    queryFn: () => getDashboardOperacional({ dataInicio, dataFim }),
    staleTime: 60_000,
  });

  function refresh(): void {
    void queryClient.invalidateQueries({
      queryKey: ['bi', 'dashboard-operacional'],
    });
  }

  const data = query.data;
  const leitosOcup = pickNumber(data, ['leitos', 'ocupados']);
  const leitosDisp = pickNumber(data, ['leitos', 'disponiveis']);
  const leitosHig = pickNumber(data, ['leitos', 'higienizacao']);
  const leitosMan = pickNumber(data, ['leitos', 'manutencao']);
  const leitosTotal = pickNumber(data, ['leitos', 'total']);
  const taxaOcupacao = pickString(data, ['leitos', 'taxaOcupacaoPct']);

  const agTotal = pickNumber(data, ['agendamentos', 'total']);
  const agRealizados = pickNumber(data, ['agendamentos', 'realizados']);
  const agNoShow = pickNumber(data, ['agendamentos', 'noShow']);
  const agNoShowPct = pickString(data, ['agendamentos', 'noShowPct']);

  const cxAg = pickNumber(data, ['cirurgias', 'qtdAgendadas']);
  const cxConc = pickNumber(data, ['cirurgias', 'qtdConcluidas']);
  const cxCanc = pickNumber(data, ['cirurgias', 'qtdCanceladas']);
  const cxDur = pickString(data, ['cirurgias', 'duracaoMediaMin']);

  const filaTotal = pickNumber(data, ['fila', 'total']) ?? 0;
  const filaDistribRaw = pickFromPath(data, ['fila', 'distribuicao']);
  const filaDistribuicao = useMemo<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    if (Array.isArray(filaDistribRaw)) {
      for (const row of filaDistribRaw) {
        if (isObj(row)) {
          const classe = String(row['classe'] ?? '').toUpperCase();
          const qtd = Number(row['qtd'] ?? 0);
          if (classe) m[classe] = Number.isFinite(qtd) ? qtd : 0;
        }
      }
    } else if (isObj(filaDistribRaw)) {
      for (const [k, v] of Object.entries(filaDistribRaw)) {
        m[k.toUpperCase()] = Number.isFinite(Number(v)) ? Number(v) : 0;
      }
    }
    return m;
  }, [filaDistribRaw]);

  const filaMaximo = Math.max(1, ...Object.values(filaDistribuicao));

  return (
    <section className="space-y-4" aria-label="Dashboard operacional">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Activity aria-hidden="true" className="h-6 w-6" />
            Dashboard operacional
          </h1>
          <p className="text-sm text-muted-foreground">
            Leitos hoje · agendamentos · cirurgias · fila Manchester.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="dt-inicio" className="text-xs">
              De
            </Label>
            <Input
              id="dt-inicio"
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="w-44"
            />
          </div>
          <div>
            <Label htmlFor="dt-fim" className="text-xs">
              Até
            </Label>
            <Input
              id="dt-fim"
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="w-44"
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
          Carregando...
        </p>
      ) : null}

      {query.isError ? (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          <AlertCircle aria-hidden="true" className="h-4 w-4" />
          Falha ao carregar o dashboard operacional.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="card-leitos">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Leitos</CardTitle>
            <Bed aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-1 pt-1">
            <p className="text-2xl font-semibold tabular-nums">
              {formatPercent(taxaOcupacao)}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatNumber(leitosOcup)} ocupados / {formatNumber(leitosTotal)} totais
            </p>
            <ul className="grid grid-cols-2 gap-1 text-[11px] text-muted-foreground">
              <li>Disponíveis: {formatNumber(leitosDisp)}</li>
              <li>Higienização: {formatNumber(leitosHig)}</li>
              <li>Manutenção: {formatNumber(leitosMan)}</li>
            </ul>
          </CardContent>
        </Card>

        <Card data-testid="card-agendamentos">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Agendamentos</CardTitle>
            <Calendar
              aria-hidden="true"
              className="h-4 w-4 text-muted-foreground"
            />
          </CardHeader>
          <CardContent className="space-y-1 pt-1">
            <p className="text-2xl font-semibold tabular-nums">
              {formatNumber(agTotal)}
            </p>
            <p className="text-xs text-muted-foreground">
              No-show: {formatPercent(agNoShowPct)} ({formatNumber(agNoShow)})
            </p>
            <p className="text-[11px] text-muted-foreground">
              Realizados: {formatNumber(agRealizados)}
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-cirurgias">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Cirurgias</CardTitle>
            <Stethoscope
              aria-hidden="true"
              className="h-4 w-4 text-muted-foreground"
            />
          </CardHeader>
          <CardContent className="space-y-1 pt-1">
            <p className="text-2xl font-semibold tabular-nums">
              {formatNumber(cxConc)}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                / {formatNumber(cxAg)}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              Canceladas: {formatNumber(cxCanc)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Duração média:{' '}
              {cxDur && Number.isFinite(Number(cxDur))
                ? `${Number(cxDur).toFixed(0)} min`
                : '—'}
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-fila">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Fila (Manchester)</CardTitle>
            <HeartPulse
              aria-hidden="true"
              className="h-4 w-4 text-muted-foreground"
            />
          </CardHeader>
          <CardContent className="pt-1">
            <p className="text-2xl font-semibold tabular-nums">
              {formatNumber(filaTotal)}
            </p>
            <ul className="mt-2 space-y-1.5">
              {MANCHESTER_ORDER.map((classe) => {
                const v = filaDistribuicao[classe] ?? 0;
                const pct = filaMaximo === 0 ? 0 : (v / filaMaximo) * 100;
                return (
                  <li key={classe} className="flex items-center gap-2 text-[11px]">
                    <span className="w-24 truncate text-muted-foreground">
                      {MANCHESTER_LABEL[classe]}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn('h-full', MANCHESTER_COLORS[classe])}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-8 text-right tabular-nums">{v}</span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

DashboardOperacionalPage.displayName = 'DashboardOperacionalPage';
