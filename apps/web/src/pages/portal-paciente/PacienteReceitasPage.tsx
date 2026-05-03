/**
 * PacienteReceitasPage — lista de receitas com link para PDF.
 */
import { useQuery } from '@tanstack/react-query';
import { Download, Loader2, Pill } from 'lucide-react';
import { Card, CardContent } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import {
  buildReceitaPdfUrl,
  getPacienteReceitas,
} from '@/lib/portal-paciente-api';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

export function PacienteReceitasPage(): JSX.Element {
  const query = useQuery({
    queryKey: ['portal-paciente', 'receitas'],
    queryFn: getPacienteReceitas,
    staleTime: 60_000,
  });

  return (
    <section className="space-y-4" aria-label="Minhas receitas">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Pill aria-hidden="true" className="h-6 w-6" />
          Minhas receitas
        </h1>
        <p className="text-base text-muted-foreground">
          Receitas emitidas pelos seus médicos.
        </p>
      </header>

      {query.isLoading ? (
        <div className="flex items-center gap-2 text-base text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          Carregando receitas...
        </div>
      ) : query.isError ? (
        <p role="alert" className="text-base text-destructive">
          {query.error instanceof ApiError
            ? query.error.detail ?? query.error.message
            : 'Não foi possível carregar suas receitas.'}
        </p>
      ) : !query.data || query.data.data.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-base text-muted-foreground">
            Nenhuma receita disponível ainda.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {query.data.data.map((receita) => (
            <li
              key={receita.uuid}
              className="rounded-md border bg-card p-4"
              data-testid={`receita-${receita.uuid}`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="text-base font-medium">
                    Receita de {formatDate(receita.dataEmissao)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Emitida por {receita.prescritorNome ?? 'profissional'}
                    {receita.prescritorConselho
                      ? ` · ${receita.prescritorConselho}`
                      : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {receita.numItens}{' '}
                    {receita.numItens === 1 ? 'medicamento' : 'medicamentos'}
                    {receita.validadeDias
                      ? ` · validade de ${receita.validadeDias} dias`
                      : ''}
                  </p>
                </div>
                {receita.pdfDisponivel ? (
                  <a
                    href={buildReceitaPdfUrl(receita.uuid)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-md border border-primary bg-primary/10 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/20"
                    aria-label={`Baixar PDF da receita de ${formatDate(receita.dataEmissao)}`}
                  >
                    <Download aria-hidden="true" className="h-4 w-4" />
                    Baixar PDF
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    PDF não disponível
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

PacienteReceitasPage.displayName = 'PacienteReceitasPage';
