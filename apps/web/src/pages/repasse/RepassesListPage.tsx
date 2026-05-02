/**
 * RepassesListPage — listagem paginada de repasses (resultados de apuração).
 *
 * Filtros: status (multi-toggle), competência (YYYY-MM), prestadorUuid,
 *          unidadeFaturamentoUuid.
 *
 * Tabela: competência · prestador · qtd itens · valor bruto · valor líquido
 *         · status · data apuração · data pagamento · ações.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calculator,
  Eye,
  Loader2,
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
import { listRepasses } from '@/lib/repasse-api';
import {
  REPASSE_STATUSES,
  REPASSE_STATUS_BADGE,
  REPASSE_STATUS_LABEL,
  type RepasseStatus,
} from '@/types/repasse';
import { cn } from '@/lib/utils';

function formatBR(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

function formatMoney(raw: string | null): string {
  if (!raw) return '—';
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function RepassesListPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [statusSel, setStatusSel] = useState<Set<RepasseStatus>>(
    () => new Set(),
  );
  const [competencia, setCompetencia] = useState('');
  const [prestadorUuid, setPrestadorUuid] = useState('');
  const [unidadeFaturamentoUuid, setUnidadeFaturamentoUuid] = useState('');
  const [page, setPage] = useState(1);

  const params = useMemo(
    () => ({
      ...(statusSel.size > 0 ? { status: Array.from(statusSel) } : {}),
      ...(competencia ? { competencia } : {}),
      ...(prestadorUuid ? { prestadorUuid } : {}),
      ...(unidadeFaturamentoUuid ? { unidadeFaturamentoUuid } : {}),
      page,
      pageSize: 20,
    }),
    [statusSel, competencia, prestadorUuid, unidadeFaturamentoUuid, page],
  );

  const repassesQuery = useQuery({
    queryKey: ['repasse', 'list', params],
    queryFn: () => listRepasses(params),
    staleTime: 10_000,
  });

  function toggleStatus(s: RepasseStatus): void {
    setStatusSel((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
    setPage(1);
  }

  const linhas = repassesQuery.data?.data ?? [];
  const meta = repassesQuery.data?.meta;

  return (
    <section className="space-y-4" aria-label="Listagem de repasses">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Calculator aria-hidden="true" className="h-6 w-6" />
            Repasses
          </h1>
          <p className="text-sm text-muted-foreground">
            Apurações por competência: APURADO → CONFERIDO → LIBERADO → PAGO.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              queryClient.invalidateQueries({
                queryKey: ['repasse', 'list'],
              })
            }
          >
            <RefreshCw aria-hidden="true" />
            Atualizar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => navigate('/repasse/apurar')}
          >
            <Calculator aria-hidden="true" />
            Apurar competência
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="r-comp">Competência (YYYY-MM)</Label>
              <Input
                id="r-comp"
                value={competencia}
                onChange={(e) => {
                  setCompetencia(e.target.value);
                  setPage(1);
                }}
                placeholder="2026-04"
                pattern="^\d{4}-\d{2}$"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="r-prest">Prestador (UUID)</Label>
              <Input
                id="r-prest"
                value={prestadorUuid}
                onChange={(e) => {
                  setPrestadorUuid(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="r-und">Unidade fat. (UUID)</Label>
              <Input
                id="r-und"
                value={unidadeFaturamentoUuid}
                onChange={(e) => {
                  setUnidadeFaturamentoUuid(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-md border bg-background p-2">
            <span className="mr-2 text-xs font-medium text-muted-foreground">
              Status:
            </span>
            {REPASSE_STATUSES.map((s) => {
              const active = statusSel.has(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleStatus(s)}
                  aria-pressed={active}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-all',
                    REPASSE_STATUS_BADGE[s],
                    active ? 'ring-2 ring-offset-1 ring-foreground' : 'opacity-60',
                  )}
                >
                  {REPASSE_STATUS_LABEL[s]}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-md border">
        <Table data-testid="repasses-tabela">
          <TableHeader>
            <TableRow>
              <TableHead>Competência</TableHead>
              <TableHead>Prestador</TableHead>
              <TableHead className="text-right">Itens</TableHead>
              <TableHead className="text-right">Bruto</TableHead>
              <TableHead className="text-right">Líquido</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Apuração</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {repassesQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="py-6 text-center text-sm">
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
                  colSpan={9}
                  className="py-6 text-center text-sm text-muted-foreground"
                >
                  Nenhum repasse para os filtros.
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((r) => (
                <TableRow key={r.uuid} data-testid={`repasse-row-${r.uuid}`}>
                  <TableCell className="text-xs font-mono">
                    {r.competencia}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.prestadorNome ?? r.prestadorUuid}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {r.qtdItens}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {formatMoney(r.valorBruto)}
                  </TableCell>
                  <TableCell className="text-right text-xs font-semibold tabular-nums">
                    {formatMoney(r.valorLiquido)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                        REPASSE_STATUS_BADGE[r.status],
                      )}
                    >
                      {REPASSE_STATUS_LABEL[r.status]}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">
                    {formatBR(r.dataApuracao)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {formatBR(r.dataPagamento)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/repasse/${r.uuid}`)}
                      aria-label={`Ver repasse de ${r.prestadorNome ?? r.prestadorUuid}`}
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
            Página {meta.page} de {meta.totalPages} · {meta.total} repasse(s)
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

RepassesListPage.displayName = 'RepassesListPage';
