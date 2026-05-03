/**
 * PacienteHomePage — boas-vindas + cards do portal do paciente.
 *
 * Linguagem: amigável, sem jargão. Acessibilidade reforçada: links com
 * aria-labels descritivos e área de boas-vindas como `<h1>`.
 */
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  Calendar,
  ChevronRight,
  CreditCard,
  TestTube2,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { getPacienteMe } from '@/lib/portal-paciente-api';

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function primeiroNome(nome: string): string {
  return nome.split(/\s+/u)[0] ?? nome;
}

export function PacienteHomePage(): JSX.Element {
  const meQuery = useQuery({
    queryKey: ['portal-paciente', 'me'],
    queryFn: getPacienteMe,
    staleTime: 30_000,
  });

  if (meQuery.isLoading) {
    return (
      <section className="space-y-4">
        <Skeleton className="h-12 w-72" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </section>
    );
  }

  if (meQuery.isError || !meQuery.data) {
    const msg =
      meQuery.error instanceof ApiError
        ? meQuery.error.detail ?? meQuery.error.message
        : 'Não foi possível carregar suas informações no momento.';
    return (
      <p role="alert" className="text-base text-destructive">
        {msg}
      </p>
    );
  }

  const me = meQuery.data;

  return (
    <section className="space-y-6" aria-label="Página inicial do paciente">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">
          Olá, {primeiroNome(me.nome)} 👋
        </h1>
        <p className="text-base text-muted-foreground">
          Que bom ter você aqui. Como podemos ajudar hoje?
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CardLink
          to="/portal/paciente/agendamentos"
          icon={<Calendar className="h-6 w-6" />}
          label="Próximas consultas"
          value={me.resumo.proximaConsulta ? '1+' : '0'}
          description={
            me.resumo.proximaConsulta
              ? formatDateTime(me.resumo.proximaConsulta.inicio)
              : 'Nenhuma agendada'
          }
        />
        <CardLink
          to="/portal/paciente/exames"
          icon={<TestTube2 className="h-6 w-6" />}
          label="Resultados de exames"
          value={String(me.resumo.examesDisponiveis)}
          description={
            me.resumo.examesDisponiveis > 0
              ? 'disponíveis para visualizar'
              : 'sem novos resultados'
          }
          highlight={me.resumo.examesDisponiveis > 0}
        />
        <CardLink
          to="/portal/paciente/notificacoes"
          icon={<Bell className="h-6 w-6" />}
          label="Avisos"
          value={String(me.resumo.notificacoesNaoLidas)}
          description={
            me.resumo.notificacoesNaoLidas > 0
              ? 'não lidos'
              : 'nada pendente'
          }
          highlight={me.resumo.notificacoesNaoLidas > 0}
        />
        <CardLink
          to="/portal/paciente/contas"
          icon={<CreditCard className="h-6 w-6" />}
          label="Pagamentos"
          value={String(me.resumo.contasEmAberto)}
          description={
            me.resumo.contasEmAberto > 0
              ? 'em aberto'
              : 'sem pendências'
          }
        />
      </div>

      {me.resumo.proximaConsulta ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sua próxima consulta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-base">
              <strong>{me.resumo.proximaConsulta.tipo}</strong> com{' '}
              {me.resumo.proximaConsulta.prestadorNome ?? 'a equipe'}.
            </p>
            <p className="text-base">
              {formatDateTime(me.resumo.proximaConsulta.inicio)}
            </p>
            {me.resumo.proximaConsulta.unidadeNome ? (
              <p className="text-sm text-muted-foreground">
                Local: {me.resumo.proximaConsulta.unidadeNome}
              </p>
            ) : null}
            {me.resumo.proximaConsulta.linkTeleconsulta ? (
              <Link
                to={`/portal/paciente/teleconsulta/${me.resumo.proximaConsulta.uuid}`}
                className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
              >
                Entrar na teleconsulta
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Atalhos</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2">
            <li>
              <Link
                to="/portal/paciente/agendar"
                className="block rounded-md border bg-card p-4 text-base font-medium hover:bg-accent/40"
              >
                Agendar uma consulta
              </Link>
            </li>
            <li>
              <Link
                to="/portal/paciente/receitas"
                className="block rounded-md border bg-card p-4 text-base font-medium hover:bg-accent/40"
              >
                Minhas receitas
              </Link>
            </li>
            <li>
              <Link
                to="/portal/paciente/consentimentos"
                className="block rounded-md border bg-card p-4 text-base font-medium hover:bg-accent/40"
              >
                Termos de privacidade
              </Link>
            </li>
            <li>
              <Link
                to="/portal/paciente/notificacoes"
                className="block rounded-md border bg-card p-4 text-base font-medium hover:bg-accent/40"
              >
                Histórico de avisos
              </Link>
            </li>
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}

PacienteHomePage.displayName = 'PacienteHomePage';

interface CardLinkProps {
  to: string;
  icon: JSX.Element;
  label: string;
  value: string;
  description: string;
  highlight?: boolean;
}

function CardLink({
  to,
  icon,
  label,
  value,
  description,
  highlight,
}: CardLinkProps): JSX.Element {
  return (
    <Link
      to={to}
      aria-label={`${label}: ${value} (${description})`}
      className={
        'flex flex-col gap-2 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring' +
        (highlight ? ' border-primary' : '')
      }
    >
      <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <span aria-hidden="true">{icon}</span>
        {label}
      </span>
      <span className="text-3xl font-semibold tabular-nums">{value}</span>
      <span className="text-sm text-muted-foreground">{description}</span>
    </Link>
  );
}
