/**
 * PainelCcihPage — dashboard epidemiológico CCIH (Fase 10).
 *
 * Cards de KPI: total casos / abertos / encerrados / notificações compulsórias.
 *
 * Visualizações:
 *   - Bar chart "Taxa por setor" (RN-CCI-04) — render manual em CSS/SVG.
 *   - Lista top 5 topografias.
 *   - Lista top 10 microorganismos.
 *   - Tabela de perfil de resistência por antibiótico.
 *
 * Decisão: optei por barras com `<div>` proporcionais (sem dependências) em
 *   vez de adicionar Recharts/Chart.js — evita aumento de bundle e a Trilha
 *   D pediu apenas painel "minimamente útil".
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
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
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { getPainelCcih } from '@/lib/ccih-api';
import { cn } from '@/lib/utils';

function currentCompetencia(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function PainelCcihPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [competencia, setCompetencia] = useState(currentCompetencia());

  const painelQuery = useQuery({
    queryKey: ['ccih', 'painel', competencia],
    queryFn: () => getPainelCcih(competencia),
    staleTime: 60_000,
  });

  function refresh(): void {
    void queryClient.invalidateQueries({
      queryKey: ['ccih', 'painel', competencia],
    });
  }

  const painel = painelQuery.data;

  return (
    <section className="space-y-4" aria-label="Painel CCIH">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Gauge aria-hidden="true" className="h-6 w-6" />
            Painel CCIH
          </h1>
          <p className="text-sm text-muted-foreground">
            Indicadores epidemiológicos da competência (RN-CCI-04).
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="painel-comp">Competência</Label>
            <Input
              id="painel-comp"
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
              placeholder="2026-04"
              pattern="^\d{4}-\d{2}$"
              className="w-32"
            />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={refresh}>
            <RefreshCw aria-hidden="true" />
            Atualizar
          </Button>
        </div>
      </header>

      {painelQuery.isLoading ? (
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          Carregando painel...
        </p>
      ) : null}

      {painel ? (
        <>
          <div
            data-testid="painel-kpis"
            className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          >
            <KpiCard
              label="Total casos"
              value={painel.totalCasos}
              icon={FileWarning}
            />
            <KpiCard
              label="Abertos"
              value={painel.totalAbertos}
              icon={Activity}
              color="text-amber-700"
            />
            <KpiCard
              label="Encerrados"
              value={painel.totalEncerrados}
              icon={CheckCircle2}
              color="text-emerald-700"
            />
            <KpiCard
              label="Notif. compulsórias"
              value={painel.totalNotificacoesCompulsorias}
              icon={AlertCircle}
              color="text-red-700"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Card data-testid="painel-taxa-setor">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  Taxa de IRAS por setor (por 1.000 pacientes-dia)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <BarChart taxas={painel.taxaPorSetor} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Top 5 topografias</CardTitle>
              </CardHeader>
              <CardContent>
                <TopList items={painel.topTopografias.slice(0, 5)} />
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Top 10 microorganismos</CardTitle>
              </CardHeader>
              <CardContent>
                <TopList items={painel.topMicroorganismos.slice(0, 10)} italic />
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  Perfil de resistência por antibiótico
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResistenciaTabela perfil={painel.perfilResistencia} />
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </section>
  );
}

PainelCcihPage.displayName = 'PainelCcihPage';

interface KpiCardProps {
  label: string;
  value: number;
  icon: typeof Activity;
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

interface BarChartProps {
  taxas: import('@/types/ccih').PainelTaxaSetor[];
}

function BarChart({ taxas }: BarChartProps): JSX.Element {
  if (taxas.length === 0) {
    return (
      <p className="py-2 text-sm text-muted-foreground">
        Sem dados para a competência.
      </p>
    );
  }
  const max = Math.max(...taxas.map((t) => t.taxa), 1);
  return (
    <ul className="space-y-2">
      {taxas.map((t) => {
        const pct = Math.round((t.taxa / max) * 100);
        return (
          <li key={t.setorUuid} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium">{t.setorNome ?? t.setorUuid}</span>
              <span className="tabular-nums text-muted-foreground">
                {t.taxa.toFixed(2)} ({t.casos}/{t.pacientesDia} pd)
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted/40">
              <div
                className="h-2 rounded-full bg-orange-500"
                style={{ width: `${pct}%` }}
                role="progressbar"
                aria-valuenow={t.taxa}
                aria-valuemin={0}
                aria-valuemax={max}
                aria-label={`Taxa ${t.setorNome ?? t.setorUuid}`}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function TopList({
  items,
  italic = false,
}: {
  items: import('@/types/ccih').PainelTopItem[];
  italic?: boolean;
}): JSX.Element {
  if (items.length === 0) {
    return <p className="py-2 text-sm text-muted-foreground">Sem dados.</p>;
  }
  const max = Math.max(...items.map((i) => i.contagem), 1);
  return (
    <ol className="space-y-2">
      {items.map((it) => {
        const pct = Math.round((it.contagem / max) * 100);
        return (
          <li key={it.chave} className="space-y-1 text-xs">
            <div className="flex items-baseline justify-between gap-2">
              <span className={cn('font-medium', italic && 'italic')}>
                {it.chave}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {it.contagem}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted/40">
              <div
                className="h-1.5 rounded-full bg-blue-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ResistenciaTabela({
  perfil,
}: {
  perfil: import('@/types/ccih').PainelResistenciaItem[];
}): JSX.Element {
  if (perfil.length === 0) {
    return (
      <p className="py-2 text-sm text-muted-foreground">
        Sem antibiogramas no período.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Antibiótico</TableHead>
            <TableHead className="text-right">Testes</TableHead>
            <TableHead className="text-right">Sens.</TableHead>
            <TableHead className="text-right">Inter.</TableHead>
            <TableHead className="text-right">Resist.</TableHead>
            <TableHead className="text-right">% Resist.</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {perfil.map((p) => (
            <TableRow key={p.antibiotico}>
              <TableCell className="text-xs">{p.antibiotico}</TableCell>
              <TableCell className="text-right text-xs tabular-nums">
                {p.totalTestes}
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums text-emerald-700">
                {p.sensiveis}
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums text-amber-700">
                {p.intermediarios}
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums text-red-700">
                {p.resistentes}
              </TableCell>
              <TableCell className="text-right text-xs font-semibold tabular-nums">
                {p.taxaResistencia.toFixed(1)}%
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
