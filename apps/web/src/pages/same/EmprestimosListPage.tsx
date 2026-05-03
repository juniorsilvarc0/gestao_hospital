/**
 * EmprestimosListPage — listagem paginada de empréstimos SAME (Fase 10).
 *
 * Filtros: status (multi), apenas atrasados (toggle).
 * Cada linha permite "Devolver" se status != DEVOLVIDO.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ClipboardList,
  Loader2,
  RefreshCw,
} from 'lucide-react';
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
import { ApiError } from '@/lib/api-client';
import { devolverEmprestimo, listEmprestimos } from '@/lib/same-api';
import { useToast } from '@/components/Toast';
import {
  EMPRESTIMO_STATUSES,
  EMPRESTIMO_STATUS_BADGE,
  EMPRESTIMO_STATUS_LABEL,
  type EmprestimoStatus,
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

export function EmprestimosListPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();

  const [statusSel, setStatusSel] = useState<Set<EmprestimoStatus>>(() => new Set());
  const [apenasAtrasados, setApenasAtrasados] = useState(false);
  const [page, setPage] = useState(1);

  const params = useMemo(
    () => ({
      ...(statusSel.size > 0 ? { status: Array.from(statusSel) } : {}),
      ...(apenasAtrasados ? { apenasAtrasados: true } : {}),
      page,
      pageSize: 20,
    }),
    [statusSel, apenasAtrasados, page],
  );

  const empQuery = useQuery({
    queryKey: ['same', 'emprestimos', 'list', params],
    queryFn: () => listEmprestimos(params),
    staleTime: 15_000,
  });

  function toggleStatus(s: EmprestimoStatus): void {
    setStatusSel((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
    setPage(1);
  }

  const devolverM = useMutation({
    mutationFn: (uuid: string) => devolverEmprestimo(uuid),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Empréstimo devolvido',
        description: '',
      });
      void queryClient.invalidateQueries({
        queryKey: ['same', 'emprestimos', 'list'],
      });
    },
    onError: (e) => {
      const detail =
        e instanceof ApiError
          ? e.detail ?? e.title ?? e.message
          : 'Falha na devolução.';
      showToast({
        variant: 'destructive',
        title: 'Falha ao devolver',
        description: detail,
      });
    },
  });

  const linhas = empQuery.data?.data ?? [];
  const meta = empQuery.data?.meta;

  return (
    <section className="space-y-4" aria-label="Listagem de empréstimos SAME">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ClipboardList aria-hidden="true" className="h-6 w-6" />
            Empréstimos
          </h1>
          <p className="text-sm text-muted-foreground">
            Controle de saída/devolução de prontuários físicos.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              queryClient.invalidateQueries({
                queryKey: ['same', 'emprestimos', 'list'],
              })
            }
          >
            <RefreshCw aria-hidden="true" />
            Atualizar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => navigate('/same/emprestimos/atrasados')}
          >
            Ver atrasados
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={apenasAtrasados}
              onChange={(e) => {
                setApenasAtrasados(e.target.checked);
                setPage(1);
              }}
              className="h-4 w-4 rounded border-input"
            />
            Apenas atrasados
          </label>

          <div className="flex flex-wrap items-center gap-1 rounded-md border bg-background p-2">
            <span className="mr-2 text-xs font-medium text-muted-foreground">
              Status:
            </span>
            {EMPRESTIMO_STATUSES.map((s) => {
              const active = statusSel.has(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleStatus(s)}
                  aria-pressed={active}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-all',
                    EMPRESTIMO_STATUS_BADGE[s],
                    active ? 'ring-2 ring-offset-1 ring-foreground' : 'opacity-60',
                  )}
                >
                  {EMPRESTIMO_STATUS_LABEL[s]}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-md border">
        <Table data-testid="emprestimos-tabela">
          <TableHeader>
            <TableRow>
              <TableHead>Pasta</TableHead>
              <TableHead>Paciente</TableHead>
              <TableHead>Solicitante</TableHead>
              <TableHead>Empréstimo</TableHead>
              <TableHead>Devolver até</TableHead>
              <TableHead>Devolvido em</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {empQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-6 text-center text-sm">
                  <Loader2
                    aria-hidden="true"
                    className="mr-2 inline h-4 w-4 animate-spin"
                  />
                  Carregando...
                </TableCell>
              </TableRow>
            ) : linhas.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-6 text-center text-sm text-muted-foreground"
                >
                  Nenhum empréstimo para os filtros.
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((e) => (
                <TableRow key={e.uuid} data-testid={`emprestimo-row-${e.uuid}`}>
                  <TableCell className="text-xs font-mono">
                    {e.prontuarioNumeroPasta ?? e.prontuarioUuid}
                  </TableCell>
                  <TableCell className="text-xs">
                    {e.pacienteNome ?? e.pacienteUuid ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs">
                    {e.solicitanteNome ?? e.solicitanteUuid}
                  </TableCell>
                  <TableCell className="text-xs">
                    {formatDateTime(e.dataEmprestimo)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {formatBR(e.dataDevolucaoPrevista)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {formatDateTime(e.dataDevolucaoReal)}
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
                    {e.status !== 'DEVOLVIDO' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={devolverM.isPending}
                        onClick={() => devolverM.mutate(e.uuid)}
                        aria-label={`Devolver empréstimo de ${e.prontuarioNumeroPasta ?? e.prontuarioUuid}`}
                      >
                        <CheckCircle2 aria-hidden="true" />
                        Devolver
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {meta && meta.totalPages > 1 ? (
        <footer className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Página {meta.page} de {meta.totalPages} · {meta.total} empréstimo(s)
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= meta.totalPages}
            >
              Próxima
            </Button>
          </div>
        </footer>
      ) : null}
    </section>
  );
}

EmprestimosListPage.displayName = 'EmprestimosListPage';
