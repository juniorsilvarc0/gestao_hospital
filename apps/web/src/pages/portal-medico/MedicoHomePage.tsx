/**
 * MedicoHomePage — dashboard do Portal do Médico (Fase 11 R-C).
 *
 * Resumo do dia + próximas consultas + contadores chave + repasse do mês.
 * Consome `GET /v1/portal/medico/dashboard` para evitar N requests.
 */
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Calendar,
  ChevronRight,
  ClipboardList,
  FileText,
  Stethoscope,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { getMedicoDashboard } from '@/lib/portal-medico-api';
import {
  REPASSE_STATUS_BADGE,
  REPASSE_STATUS_LABEL,
} from '@/types/repasse';
import { cn } from '@/lib/utils';

function formatDateTime(iso?: string | null): string {
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

function formatMoney(raw: string | null | undefined): string {
  if (raw === null || raw === undefined || raw === '') return '—';
  const n = Number(raw);
  if (!Number.isFinite(n)) return String(raw);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function MedicoHomePage(): JSX.Element {
  const dashboardQuery = useQuery({
    queryKey: ['portal-medico', 'dashboard'],
    queryFn: getMedicoDashboard,
    staleTime: 30_000,
  });

  if (dashboardQuery.isLoading) {
    return (
      <section className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </section>
    );
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    const msg =
      dashboardQuery.error instanceof ApiError
        ? dashboardQuery.error.detail ?? dashboardQuery.error.message
        : 'Falha ao carregar dashboard.';
    return (
      <p role="alert" className="text-sm text-destructive">
        {msg}
      </p>
    );
  }

  const dashboard = dashboardQuery.data;

  return (
    <section className="space-y-6" aria-label="Início do portal do médico">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Hoje</h1>
        <p className="text-sm text-muted-foreground">
          Visão geral da sua agenda, laudos pendentes e repasses.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ResumoCard
          icon={<Calendar className="h-5 w-5" />}
          label="Consultas hoje"
          value={String(dashboard.hoje.agendamentos)}
          to="/portal/medico/agenda"
        />
        <ResumoCard
          icon={<Stethoscope className="h-5 w-5" />}
          label="Cirurgias hoje"
          value={String(dashboard.hoje.cirurgias)}
          to="/portal/medico/cirurgias"
        />
        <ResumoCard
          icon={<FileText className="h-5 w-5" />}
          label="Laudos pendentes"
          value={String(dashboard.hoje.laudosPendentes)}
          to="/portal/medico/laudos-pendentes"
          highlight={dashboard.hoje.laudosPendentes > 0}
        />
        <ResumoCard
          icon={<TrendingUp className="h-5 w-5" />}
          label={`Produção ${dashboard.competenciaAtual.competencia}`}
          value={formatMoney(dashboard.competenciaAtual.producaoTotal.valor)}
          to="/portal/medico/producao"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Próximos compromissos</CardTitle>
          </CardHeader>
          <CardContent>
            {dashboard.proximas.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sem compromissos no horizonte próximo.
              </p>
            ) : (
              <ul className="divide-y">
                {dashboard.proximas.map((item) => (
                  <li key={`${item.tipo}-${item.uuid}`} className="py-3">
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                          item.tipo === 'cirurgia'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-blue-100 text-blue-700',
                        )}
                      >
                        {item.tipo === 'cirurgia' ? (
                          <Stethoscope className="h-4 w-4" />
                        ) : (
                          <ClipboardList className="h-4 w-4" />
                        )}
                      </span>
                      <div className="flex-1 text-sm">
                        <p className="font-medium">
                          {item.pacienteNome ?? 'Paciente'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.tipo === 'cirurgia' ? 'Cirurgia' : 'Consulta'} ·{' '}
                          {formatDateTime(item.data)}
                        </p>
                        {item.observacao ? (
                          <p className="text-xs text-muted-foreground">
                            {item.observacao}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4" />
              Repasse{' '}
              <span className="text-muted-foreground">
                · {dashboard.competenciaAtual.competencia}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {dashboard.competenciaAtual.repasse ? (
              <>
                <p className="text-2xl font-semibold tabular-nums">
                  {formatMoney(
                    dashboard.competenciaAtual.repasse.valorLiquido,
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {dashboard.competenciaAtual.repasse.qtdItens} itens
                </p>
                <span
                  className={cn(
                    'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
                    REPASSE_STATUS_BADGE[
                      dashboard.competenciaAtual.repasse.status
                    ],
                  )}
                >
                  {
                    REPASSE_STATUS_LABEL[
                      dashboard.competenciaAtual.repasse.status
                    ]
                  }
                </span>
                <Link
                  to="/portal/medico/repasses"
                  className="mt-2 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Ver todos os repasses
                  <ChevronRight className="h-3 w-3" />
                </Link>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Sem repasse apurado para a competência atual.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Esta semana</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Consultas" value={String(dashboard.semana.agendamentos)} />
            <Stat label="Cirurgias" value={String(dashboard.semana.cirurgias)} />
          </dl>
        </CardContent>
      </Card>
    </section>
  );
}

MedicoHomePage.displayName = 'MedicoHomePage';

interface ResumoCardProps {
  icon: JSX.Element;
  label: string;
  value: string;
  to: string;
  highlight?: boolean;
}

function ResumoCard({
  icon,
  label,
  value,
  to,
  highlight,
}: ResumoCardProps): JSX.Element {
  return (
    <Link
      to={to}
      className={cn(
        'flex flex-col gap-1 rounded-lg border bg-card p-3 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        highlight && 'border-amber-400 bg-amber-50',
      )}
    >
      <span className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <span aria-hidden="true">{icon}</span>
        {label}
      </span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
