/**
 * SecurityDashboardPage — dashboard global de segurança (Fase 13 R-C).
 *
 * Header: select com janela (7/30/90 dias).
 * Cards: total / CRITICO / ALERTA / bloqueios ativos.
 * Tabelas: top IPs com bloqueios, top tipos, eventos recentes (timeline).
 *
 * Fonte: GET /v1/admin/security/dashboard?dias=...
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { getSecurityDashboard } from '@/lib/admin-api';
import {
  SECURITY_SEVERIDADE_BADGE,
  SECURITY_SEVERIDADE_LABEL,
  type SecuritySeveridade,
} from '@/types/auditoria';
import { cn } from '@/lib/utils';

const DIAS_OPCOES = [7, 30, 90] as const;
type DiasOpcao = (typeof DIAS_OPCOES)[number];

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('pt-BR');
}

export function SecurityDashboardPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [dias, setDias] = useState<DiasOpcao>(30);

  const dashboardQuery = useQuery({
    queryKey: ['admin', 'security-dashboard', dias],
    queryFn: () => getSecurityDashboard({ dias }),
    staleTime: 30_000,
  });

  const data = dashboardQuery.data;
  const resumo = data?.resumo;
  const topIps = data?.ipsTopBloqueios ?? [];
  const topTipos = data?.topTipos ?? [];
  const recentes = data?.eventosRecentes ?? [];

  const totalBloqueios = topIps.reduce(
    (acc, ip) => acc + (ip.qtdBloqueios ?? 0),
    0,
  );

  return (
    <section
      className="space-y-4"
      aria-label="Admin — security dashboard"
      data-testid="admin-security-dashboard-page"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ShieldAlert aria-hidden="true" className="h-6 w-6" />
            Security Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Visão consolidada cross-tenant de eventos de segurança.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <label
              htmlFor="sec-dias"
              className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              Janela
            </label>
            <Select
              id="sec-dias"
              value={String(dias)}
              data-testid="sec-dias-select"
              onChange={(e) => setDias(Number(e.target.value) as DiasOpcao)}
            >
              {DIAS_OPCOES.map((d) => (
                <option key={d} value={d}>
                  Últimos {d} dias
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
                queryKey: ['admin', 'security-dashboard'],
              })
            }
          >
            <RefreshCw aria-hidden="true" />
            Atualizar
          </Button>
        </div>
      </header>

      {dashboardQuery.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          Carregando dashboard...
        </p>
      ) : null}

      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        data-testid="sec-cards"
      >
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
              Total de eventos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {formatNumber(resumo?.totalEventos)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
              Críticos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className="text-2xl font-semibold tabular-nums text-red-700"
              data-testid="card-criticos"
            >
              {formatNumber(resumo?.porSeveridade.CRITICO)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
              Alertas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className="text-2xl font-semibold tabular-nums text-orange-700"
              data-testid="card-alertas"
            >
              {formatNumber(resumo?.porSeveridade.ALERTA)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
              Bloqueios ativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {formatNumber(totalBloqueios)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Top 10 IPs com bloqueios</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table data-testid="sec-top-ips">
              <TableHeader>
                <TableRow>
                  <TableHead>IP</TableHead>
                  <TableHead className="text-right">Bloqueios</TableHead>
                  <TableHead>Última ocorrência</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topIps.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="py-4 text-center text-sm text-muted-foreground"
                    >
                      Sem bloqueios na janela.
                    </TableCell>
                  </TableRow>
                ) : (
                  topIps.slice(0, 10).map((row) => (
                    <TableRow key={row.ip}>
                      <TableCell className="font-mono text-xs">
                        {row.ip}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {formatNumber(row.qtdBloqueios)}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {formatDateTime(row.ultimaOcorrencia)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Top tipos de evento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table data-testid="sec-top-tipos">
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topTipos.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={2}
                      className="py-4 text-center text-sm text-muted-foreground"
                    >
                      Sem eventos na janela.
                    </TableCell>
                  </TableRow>
                ) : (
                  topTipos.map((row) => (
                    <TableRow key={row.tipo}>
                      <TableCell className="font-mono text-xs">
                        {row.tipo}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {formatNumber(row.qtd)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Últimos eventos críticos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table data-testid="sec-recentes">
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Severidade</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentes.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-4 text-center text-sm text-muted-foreground"
                    >
                      Sem eventos recentes.
                    </TableCell>
                  </TableRow>
                ) : (
                  recentes.map((ev) => {
                    const sev = ev.severidade as SecuritySeveridade;
                    const badgeCls =
                      SECURITY_SEVERIDADE_BADGE[sev] ??
                      'bg-zinc-100 text-zinc-900 border-zinc-300';
                    const sevLabel =
                      SECURITY_SEVERIDADE_LABEL[sev] ??
                      String(ev.severidade);
                    return (
                      <TableRow key={ev.uuid}>
                        <TableCell className="text-xs tabular-nums">
                          {formatDateTime(ev.ocorridoEm)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {ev.tipo}
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                              badgeCls,
                            )}
                          >
                            {sevLabel}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs">
                          {ev.usuarioNome ?? '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {ev.ip ?? '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

SecurityDashboardPage.displayName = 'SecurityDashboardPage';
