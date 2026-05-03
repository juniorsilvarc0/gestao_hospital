/**
 * PacienteResultadoExamePage — visualização de resultado laudado.
 *
 * Mostra texto do laudo + link para baixar o PDF (quando disponível).
 */
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, Loader2, TestTube2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { getPacienteResultadoExame } from '@/lib/portal-paciente-api';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

export function PacienteResultadoExamePage(): JSX.Element {
  const { uuid = '' } = useParams<{ uuid: string }>();
  const query = useQuery({
    queryKey: ['portal-paciente', 'resultado-exame', uuid],
    queryFn: () => getPacienteResultadoExame(uuid),
    enabled: Boolean(uuid),
    staleTime: 60_000,
  });

  return (
    <section
      className="max-w-3xl space-y-4"
      aria-label="Resultado do exame"
    >
      <Button asChild variant="outline" size="sm">
        <Link to="/portal/paciente/exames">
          <ArrowLeft aria-hidden="true" />
          Voltar para meus exames
        </Link>
      </Button>

      {query.isLoading ? (
        <div className="flex items-center gap-2 text-base text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          Carregando resultado...
        </div>
      ) : query.isError ? (
        <p role="alert" className="text-base text-destructive">
          {query.error instanceof ApiError
            ? query.error.detail ?? query.error.message
            : 'Não foi possível carregar o resultado.'}
        </p>
      ) : !query.data ? null : (
        <>
          <header>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <TestTube2 aria-hidden="true" className="h-6 w-6" />
              Resultado de exame
            </h1>
            <p className="text-base text-muted-foreground">
              {query.data.procedimentoNome ?? 'Exame'}
              {query.data.procedimentoCodigo
                ? ` · ${query.data.procedimentoCodigo}`
                : ''}
            </p>
          </header>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>
                <strong>Data da coleta:</strong> {formatDate(query.data.dataColeta)}
              </p>
              <p>
                <strong>Data do resultado:</strong> {formatDate(query.data.dataLaudo)}
              </p>
              {query.data.responsavelNome ? (
                <p>
                  <strong>Responsável pelo resultado:</strong>{' '}
                  {query.data.responsavelNome}
                  {query.data.responsavelConselho
                    ? ` · ${query.data.responsavelConselho}`
                    : ''}
                </p>
              ) : null}
            </CardContent>
          </Card>

          {query.data.laudoPdfUrl ? (
            <Button asChild>
              <a
                href={query.data.laudoPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Baixar resultado em PDF"
              >
                <Download aria-hidden="true" />
                Baixar PDF
              </a>
            </Button>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resultado</CardTitle>
            </CardHeader>
            <CardContent>
              {query.data.laudoTexto ? (
                <article className="whitespace-pre-line text-sm leading-relaxed">
                  {query.data.laudoTexto}
                </article>
              ) : (
                <p className="text-sm text-muted-foreground">
                  O texto do resultado ficará disponível em breve.
                </p>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Em caso de dúvida sobre este resultado, converse com o
            profissional que solicitou o exame antes de tomar qualquer
            decisão.
          </p>
        </>
      )}
    </section>
  );
}

PacienteResultadoExamePage.displayName = 'PacienteResultadoExamePage';
