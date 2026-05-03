/**
 * MedicoLaudosPendentesPage — fila de laudos a serem emitidos pelo médico.
 *
 * O link de "Laudar" leva à Central de Laudos (Fase 6) com o filtro do
 * resultado pré-selecionado via query param.
 */
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileText, Loader2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { getMedicoLaudosPendentes } from '@/lib/portal-medico-api';

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}

export function MedicoLaudosPendentesPage(): JSX.Element {
  const query = useQuery({
    queryKey: ['portal-medico', 'laudos-pendentes'],
    queryFn: getMedicoLaudosPendentes,
    staleTime: 30_000,
  });

  return (
    <section className="space-y-4" aria-label="Laudos pendentes">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <FileText aria-hidden="true" className="h-6 w-6" />
          Laudos pendentes
        </h1>
        <p className="text-sm text-muted-foreground">
          Resultados de exames que aguardam a sua emissão de laudo.
        </p>
      </header>

      {query.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          Carregando...
        </div>
      ) : query.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {query.error instanceof ApiError
            ? query.error.detail ?? query.error.message
            : 'Falha ao carregar laudos pendentes.'}
        </p>
      ) : !query.data || query.data.data.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          Sem laudos pendentes. Bom trabalho!
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table data-testid="laudos-pendentes-tabela">
            <TableHeader>
              <TableRow>
                <TableHead>Paciente</TableHead>
                <TableHead>Procedimento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Coleta</TableHead>
                <TableHead>Processamento</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.data.map((l) => (
                <TableRow
                  key={l.resultadoUuid}
                  data-testid={`laudo-pend-${l.resultadoUuid}`}
                >
                  <TableCell className="text-xs font-medium">
                    {l.pacienteNome}
                  </TableCell>
                  <TableCell className="text-xs">
                    {l.procedimentoCodigo
                      ? `${l.procedimentoCodigo} — `
                      : ''}
                    {l.procedimentoNome ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs">
                    <span className="rounded-full border bg-muted/40 px-2 py-0.5">
                      {l.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">
                    {formatDateTime(l.dataColeta)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {formatDateTime(l.dataProcessamento)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      to={`/laudos?resultado=${l.resultadoUuid}`}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Laudar
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

MedicoLaudosPendentesPage.displayName = 'MedicoLaudosPendentesPage';
