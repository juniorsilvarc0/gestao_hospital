/**
 * ProntuariosListPage — listagem paginada de prontuários físicos do SAME (Fase 10).
 *
 * Filtros: status (multi), busca por número de pasta ou paciente.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  Eye,
  Loader2,
  Plus,
  RefreshCw,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { listProntuarios } from '@/lib/same-api';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import {
  PRONTUARIO_STATUSES,
  PRONTUARIO_STATUS_BADGE,
  PRONTUARIO_STATUS_LABEL,
  type ProntuarioStatus,
} from '@/types/same';
import { cn } from '@/lib/utils';

export function ProntuariosListPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [statusSel, setStatusSel] = useState<Set<ProntuarioStatus>>(() => new Set());
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const debouncedQ = useDebouncedValue(q, 350);

  const params = useMemo(
    () => ({
      ...(statusSel.size > 0 ? { status: Array.from(statusSel) } : {}),
      ...(debouncedQ ? { q: debouncedQ } : {}),
      page,
      pageSize: 20,
    }),
    [statusSel, debouncedQ, page],
  );

  const prontuariosQuery = useQuery({
    queryKey: ['same', 'prontuarios', 'list', params],
    queryFn: () => listProntuarios(params),
    staleTime: 15_000,
  });

  function toggleStatus(s: ProntuarioStatus): void {
    setStatusSel((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
    setPage(1);
  }

  const linhas = prontuariosQuery.data?.data ?? [];
  const meta = prontuariosQuery.data?.meta;

  return (
    <section className="space-y-4" aria-label="Listagem de prontuários SAME">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Archive aria-hidden="true" className="h-6 w-6" />
            Prontuários SAME
          </h1>
          <p className="text-sm text-muted-foreground">
            Arquivo físico, digitalização e empréstimos.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              queryClient.invalidateQueries({
                queryKey: ['same', 'prontuarios', 'list'],
              })
            }
          >
            <RefreshCw aria-hidden="true" />
            Atualizar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => navigate('/same/prontuarios/novo')}
          >
            <Plus aria-hidden="true" />
            Novo prontuário
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="prnt-q">Buscar por nº pasta ou paciente</Label>
            <Input
              id="prnt-q"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="ex.: P-001 / Maria Silva"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-md border bg-background p-2">
            <span className="mr-2 text-xs font-medium text-muted-foreground">
              Status:
            </span>
            {PRONTUARIO_STATUSES.map((s) => {
              const active = statusSel.has(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleStatus(s)}
                  aria-pressed={active}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-all',
                    PRONTUARIO_STATUS_BADGE[s],
                    active ? 'ring-2 ring-offset-1 ring-foreground' : 'opacity-60',
                  )}
                >
                  {PRONTUARIO_STATUS_LABEL[s]}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-md border">
        <Table data-testid="prontuarios-tabela">
          <TableHeader>
            <TableRow>
              <TableHead>Nº pasta</TableHead>
              <TableHead>Paciente</TableHead>
              <TableHead>Localização</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Digitalizado</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {prontuariosQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-sm">
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
                  colSpan={6}
                  className="py-6 text-center text-sm text-muted-foreground"
                >
                  Nenhum prontuário para os filtros.
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((p) => (
                <TableRow key={p.uuid} data-testid={`prontuario-row-${p.uuid}`}>
                  <TableCell className="text-xs font-mono">
                    {p.numeroPasta}
                  </TableCell>
                  <TableCell className="text-xs">
                    {p.pacienteNome ?? p.pacienteUuid}
                  </TableCell>
                  <TableCell className="text-xs">
                    {p.localizacao ?? '—'}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                        PRONTUARIO_STATUS_BADGE[p.status],
                      )}
                    >
                      {PRONTUARIO_STATUS_LABEL[p.status]}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">
                    {p.digitalizado ? 'Sim' : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/same/prontuarios/${p.uuid}`)}
                      aria-label={`Ver prontuário ${p.numeroPasta}`}
                    >
                      <Eye aria-hidden="true" />
                    </Button>
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
            Página {meta.page} de {meta.totalPages} · {meta.total} prontuário(s)
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

ProntuariosListPage.displayName = 'ProntuariosListPage';
