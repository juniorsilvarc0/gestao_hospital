/**
 * PacienteAgendamentosPage — lista próximas + histórico de consultas.
 *
 * Linguagem amigável: "Próximas consultas" / "Consultas anteriores".
 */
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Loader2, Plus, Video } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { getPacienteAgendamentos } from '@/lib/portal-paciente-api';
import type { PacienteAgendamentoResumo } from '@/types/portal-paciente';

const STATUS_AMIGAVEL: Record<string, string> = {
  AGENDADO: 'Agendada',
  CONFIRMADO: 'Confirmada',
  COMPARECEU: 'Realizada',
  EM_ATENDIMENTO: 'Em atendimento',
  FALTOU: 'Não compareceu',
  CANCELADO: 'Cancelada',
  REAGENDADO: 'Reagendada',
};

function formatDateTime(iso: string): string {
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

export function PacienteAgendamentosPage(): JSX.Element {
  const query = useQuery({
    queryKey: ['portal-paciente', 'agendamentos'],
    queryFn: getPacienteAgendamentos,
    staleTime: 30_000,
  });

  return (
    <section className="space-y-6" aria-label="Minhas consultas">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Calendar aria-hidden="true" className="h-6 w-6" />
            Minhas consultas
          </h1>
          <p className="text-base text-muted-foreground">
            Próximas consultas e histórico.
          </p>
        </div>
        <Button asChild size="sm">
          <Link to="/portal/paciente/agendar">
            <Plus aria-hidden="true" />
            Agendar nova
          </Link>
        </Button>
      </header>

      {query.isLoading ? (
        <div className="flex items-center gap-2 text-base text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          Carregando suas consultas...
        </div>
      ) : query.isError ? (
        <p role="alert" className="text-base text-destructive">
          {query.error instanceof ApiError
            ? query.error.detail ?? query.error.message
            : 'Não foi possível carregar suas consultas.'}
        </p>
      ) : !query.data ? null : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Próximas consultas</CardTitle>
            </CardHeader>
            <CardContent>
              {query.data.proximas.length === 0 ? (
                <p className="text-base text-muted-foreground">
                  Você não tem consultas próximas. Que tal{' '}
                  <Link
                    to="/portal/paciente/agendar"
                    className="font-medium text-primary hover:underline"
                  >
                    agendar uma
                  </Link>
                  ?
                </p>
              ) : (
                <ul className="space-y-3" data-testid="proximas-consultas">
                  {query.data.proximas.map((a) => (
                    <AgendamentoCard key={a.uuid} agendamento={a} futura />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Consultas anteriores</CardTitle>
            </CardHeader>
            <CardContent>
              {query.data.passadas.length === 0 ? (
                <p className="text-base text-muted-foreground">
                  Sem histórico ainda.
                </p>
              ) : (
                <ul className="space-y-3" data-testid="passadas-consultas">
                  {query.data.passadas.map((a) => (
                    <AgendamentoCard
                      key={a.uuid}
                      agendamento={a}
                      futura={false}
                    />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </section>
  );
}

PacienteAgendamentosPage.displayName = 'PacienteAgendamentosPage';

function AgendamentoCard({
  agendamento,
  futura,
}: {
  agendamento: PacienteAgendamentoResumo;
  futura: boolean;
}): JSX.Element {
  return (
    <li
      className="rounded-md border bg-background p-4"
      data-testid={`agendamento-${agendamento.uuid}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-base font-medium">
            {agendamento.tipo === 'TELECONSULTA'
              ? 'Teleconsulta'
              : agendamento.procedimentoNome ?? 'Consulta'}
          </p>
          <p className="text-sm text-muted-foreground">
            {formatDateTime(agendamento.inicio)}
          </p>
          {agendamento.prestadorNome ? (
            <p className="text-sm">com {agendamento.prestadorNome}</p>
          ) : null}
          {agendamento.unidadeNome ? (
            <p className="text-sm text-muted-foreground">
              Local: {agendamento.unidadeNome}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium">
            {STATUS_AMIGAVEL[agendamento.status] ?? agendamento.status}
          </span>
          {futura && agendamento.linkTeleconsulta ? (
            <Button asChild size="sm">
              <Link to={`/portal/paciente/teleconsulta/${agendamento.uuid}`}>
                <Video aria-hidden="true" />
                Entrar
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
