/**
 * PacienteExamesPage — lista os exames do paciente.
 *
 * Status amigáveis: aguardando coleta / em análise / pronto.
 */
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, TestTube2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { getPacienteExames } from '@/lib/portal-paciente-api';
import type { PacienteExameStatus } from '@/types/portal-paciente';

const STATUS_AMIGAVEL: Record<PacienteExameStatus, string> = {
  AGUARDANDO_COLETA: 'Aguardando coleta',
  EM_ANALISE: 'Em análise',
  LAUDADO: 'Pronto',
  CANCELADO: 'Cancelado',
};

const STATUS_COR: Record<PacienteExameStatus, string> = {
  AGUARDANDO_COLETA: 'border-amber-300 bg-amber-50 text-amber-900',
  EM_ANALISE: 'border-blue-300 bg-blue-50 text-blue-900',
  LAUDADO: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  CANCELADO: 'border-zinc-300 bg-zinc-100 text-zinc-700',
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

export function PacienteExamesPage(): JSX.Element {
  const query = useQuery({
    queryKey: ['portal-paciente', 'exames'],
    queryFn: getPacienteExames,
    staleTime: 30_000,
  });

  return (
    <section className="space-y-4" aria-label="Meus exames">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <TestTube2 aria-hidden="true" className="h-6 w-6" />
          Meus exames
        </h1>
        <p className="text-base text-muted-foreground">
          Acompanhe seus exames e veja resultados quando estiverem prontos.
        </p>
      </header>

      {query.isLoading ? (
        <div className="flex items-center gap-2 text-base text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          Carregando seus exames...
        </div>
      ) : query.isError ? (
        <p role="alert" className="text-base text-destructive">
          {query.error instanceof ApiError
            ? query.error.detail ?? query.error.message
            : 'Não foi possível carregar seus exames.'}
        </p>
      ) : !query.data || query.data.data.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-base text-muted-foreground">
            Você ainda não tem exames registrados aqui.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3" data-testid="lista-exames">
          {query.data.data.map((exame) => {
            const cor = STATUS_COR[exame.status];
            return (
              <li
                key={exame.uuid}
                className="rounded-md border bg-card p-4"
                data-testid={`exame-${exame.uuid}`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-base font-medium">
                      {exame.procedimentoNome ?? 'Exame'}
                    </p>
                    {exame.procedimentoCodigo ? (
                      <p className="text-xs text-muted-foreground">
                        Código: {exame.procedimentoCodigo}
                      </p>
                    ) : null}
                    <p className="text-sm text-muted-foreground">
                      Solicitado em {formatDate(exame.dataSolicitacao)}
                      {exame.dataColeta
                        ? ` · Coletado em ${formatDate(exame.dataColeta)}`
                        : ''}
                      {exame.dataLaudo
                        ? ` · Pronto em ${formatDate(exame.dataLaudo)}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${cor}`}
                    >
                      {STATUS_AMIGAVEL[exame.status]}
                    </span>
                    {exame.resultadoDisponivel ? (
                      <Link
                        to={`/portal/paciente/exames/${exame.uuid}/resultado`}
                        className="text-sm font-semibold text-primary hover:underline"
                      >
                        Ver resultado
                      </Link>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sobre os resultados</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Os resultados ficam disponíveis aqui assim que forem liberados pelo
          médico responsável. Em caso de dúvida sobre um resultado, agende uma
          consulta de retorno com o profissional que solicitou o exame.
        </CardContent>
      </Card>
    </section>
  );
}

PacienteExamesPage.displayName = 'PacienteExamesPage';
