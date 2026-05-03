/**
 * EmprestimosAtrasadosPage — empréstimos atrasados (RN-SAM-02).
 *
 * Lista os atrasados com prazo D-X (negativo). Decisão de polling:
 *  - Optei por refetch automático ao recuperar foco e a cada 60s — atrasos
 *    não são tão urgentes quanto leitos/farmácia, mas o supervisor precisa
 *    perceber novos itens entrando na lista.
 */
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Eye, Loader2, RefreshCw } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { listAtrasados } from '@/lib/same-api';
import {
  EMPRESTIMO_STATUS_BADGE,
  EMPRESTIMO_STATUS_LABEL,
} from '@/types/same';
import { cn } from '@/lib/utils';

function formatBR(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}

function diasFormat(dias: number | null | undefined): string {
  if (dias === null || dias === undefined) return '—';
  if (dias < 0) return `D${dias}`;
  return `+${dias}`;
}

export function EmprestimosAtrasadosPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const atrasadosQuery = useQuery({
    queryKey: ['same', 'emprestimos', 'atrasados'],
    queryFn: () => listAtrasados({ pageSize: 100 }),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  const linhas = atrasadosQuery.data?.data ?? [];

  return (
    <section className="space-y-4" aria-label="Empréstimos atrasados">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <AlertCircle aria-hidden="true" className="h-6 w-6 text-red-700" />
            Empréstimos atrasados
          </h1>
          <p className="text-sm text-muted-foreground">
            RN-SAM-02: atraso &gt; 30 dias gera notificação ao supervisor.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            queryClient.invalidateQueries({
              queryKey: ['same', 'emprestimos', 'atrasados'],
            })
          }
        >
          <RefreshCw aria-hidden="true" />
          Atualizar
        </Button>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {atrasadosQuery.isLoading ? 'Carregando...' : `${linhas.length} atrasado(s)`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {atrasadosQuery.isLoading ? (
            <p className="flex items-center gap-2 py-4 text-sm">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              Carregando...
            </p>
          ) : linhas.length === 0 ? (
            <p className="py-4 text-sm text-emerald-700">
              Sem empréstimos atrasados — bom trabalho.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table data-testid="atrasados-tabela">
                <TableHeader>
                  <TableRow>
                    <TableHead>Pasta</TableHead>
                    <TableHead>Solicitante</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Empréstimo</TableHead>
                    <TableHead>Devolver até</TableHead>
                    <TableHead className="text-right">Atraso</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((e) => (
                    <TableRow
                      key={e.uuid}
                      className={cn(
                        e.diasParaDevolucao !== undefined &&
                          e.diasParaDevolucao !== null &&
                          e.diasParaDevolucao <= -30 &&
                          'bg-red-50/50',
                      )}
                    >
                      <TableCell className="text-xs font-mono">
                        {e.prontuarioNumeroPasta ?? e.prontuarioUuid}
                      </TableCell>
                      <TableCell className="text-xs">
                        {e.solicitanteNome ?? e.solicitanteUuid}
                      </TableCell>
                      <TableCell className="max-w-[260px] truncate text-xs">
                        {e.motivo ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatDateTime(e.dataEmprestimo)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatBR(e.dataDevolucaoPrevista)}
                      </TableCell>
                      <TableCell className="text-right text-xs font-semibold tabular-nums text-red-700">
                        {diasFormat(e.diasParaDevolucao)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                            EMPRESTIMO_STATUS_BADGE[e.status],
                          )}
                        >
                          {EMPRESTIMO_STATUS_LABEL[e.status]}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            navigate(`/same/prontuarios/${e.prontuarioUuid}`)
                          }
                          aria-label={`Abrir prontuário ${e.prontuarioNumeroPasta ?? ''}`}
                        >
                          <Eye aria-hidden="true" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

EmprestimosAtrasadosPage.displayName = 'EmprestimosAtrasadosPage';
