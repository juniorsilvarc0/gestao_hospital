/**
 * LotesCmePage — listagem paginada de lotes do CME (Fase 10).
 *
 * Filtros: status (multi-toggle), método de esterilização, validade próxima
 *          (próximos 7 dias).
 *
 * Tabela: número · método · data · validade · indicadores · qtd artigos
 *         · status · ações.
 *
 * Decisões:
 *  - "Validade próxima" filtra apenas no client-side (server pode ser
 *    estendido com `validadeAte=`); por enquanto destaca em laranja na linha.
 *  - Sem polling — dados não mudam tão rápido (turno hospitalar).
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Eye,
  FlaskConical,
  Loader2,
  Plus,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { listLotes } from '@/lib/cme-api';
import {
  LOTE_STATUSES,
  LOTE_STATUS_BADGE,
  LOTE_STATUS_LABEL,
  METODOS_ESTERILIZACAO,
  METODO_ESTERILIZACAO_LABEL,
  type LoteStatus,
  type MetodoEsterilizacao,
} from '@/types/cme';
import { cn } from '@/lib/utils';

function formatBR(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

function isValidadePerto(validade: string): boolean {
  const v = new Date(validade);
  if (Number.isNaN(v.getTime())) return false;
  const hoje = new Date();
  const diff = (v.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 7;
}

function isValidadeVencida(validade: string): boolean {
  const v = new Date(validade);
  if (Number.isNaN(v.getTime())) return false;
  return v.getTime() < new Date().getTime();
}

export function LotesCmePage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [statusSel, setStatusSel] = useState<Set<LoteStatus>>(() => new Set());
  const [metodo, setMetodo] = useState<MetodoEsterilizacao | ''>('');
  const [apenasValidadePerto, setApenasValidadePerto] = useState(false);
  const [page, setPage] = useState(1);

  const params = useMemo(
    () => ({
      ...(statusSel.size > 0 ? { status: Array.from(statusSel) } : {}),
      ...(metodo ? { metodo } : {}),
      page,
      pageSize: 20,
    }),
    [statusSel, metodo, page],
  );

  const lotesQuery = useQuery({
    queryKey: ['cme', 'lotes', 'list', params],
    queryFn: () => listLotes(params),
    staleTime: 15_000,
  });

  function toggleStatus(s: LoteStatus): void {
    setStatusSel((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
    setPage(1);
  }

  const linhas = (lotesQuery.data?.data ?? []).filter((l) =>
    apenasValidadePerto ? isValidadePerto(l.validade) : true,
  );
  const meta = lotesQuery.data?.meta;

  return (
    <section className="space-y-4" aria-label="Listagem de lotes do CME">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <FlaskConical aria-hidden="true" className="h-6 w-6" />
            Lotes CME
          </h1>
          <p className="text-sm text-muted-foreground">
            Esterilização: EM_PROCESSAMENTO → AGUARDANDO_INDICADOR → LIBERADO.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              queryClient.invalidateQueries({
                queryKey: ['cme', 'lotes', 'list'],
              })
            }
          >
            <RefreshCw aria-hidden="true" />
            Atualizar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => navigate('/cme/lotes/novo')}
          >
            <Plus aria-hidden="true" />
            Novo Lote
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
              <Label htmlFor="cme-metodo">Método</Label>
              <Select
                id="cme-metodo"
                value={metodo}
                onChange={(e) => {
                  setMetodo(e.target.value as MetodoEsterilizacao | '');
                  setPage(1);
                }}
              >
                <option key="__empty__" value="">— todos —</option>
                {METODOS_ESTERILIZACAO.map((m) => (
                  <option key={m} value={m}>
                    {METODO_ESTERILIZACAO_LABEL[m]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={apenasValidadePerto}
                  onChange={(e) => setApenasValidadePerto(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                Apenas validade ≤ 7 dias
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-md border bg-background p-2">
            <span className="mr-2 text-xs font-medium text-muted-foreground">
              Status:
            </span>
            {LOTE_STATUSES.map((s) => {
              const active = statusSel.has(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleStatus(s)}
                  aria-pressed={active}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-all',
                    LOTE_STATUS_BADGE[s],
                    active ? 'ring-2 ring-offset-1 ring-foreground' : 'opacity-60',
                  )}
                >
                  {LOTE_STATUS_LABEL[s]}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-md border">
        <Table data-testid="lotes-cme-tabela">
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Método</TableHead>
              <TableHead>Esterilização</TableHead>
              <TableHead>Validade</TableHead>
              <TableHead>Indicadores</TableHead>
              <TableHead className="text-right">Artigos</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lotesQuery.isLoading ? (
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
                  Nenhum lote para os filtros.
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((l) => {
                const validadePerto = isValidadePerto(l.validade);
                const validadeVencida = isValidadeVencida(l.validade);
                return (
                  <TableRow key={l.uuid} data-testid={`lote-row-${l.uuid}`}>
                    <TableCell className="text-xs font-mono">{l.numero}</TableCell>
                    <TableCell className="text-xs">
                      {METODO_ESTERILIZACAO_LABEL[l.metodo]}
                    </TableCell>
                    <TableCell className="text-xs">
                      {formatBR(l.dataEsterilizacao)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-xs',
                        validadeVencida && 'font-semibold text-red-700',
                        validadePerto && !validadeVencida && 'font-semibold text-amber-700',
                      )}
                    >
                      {formatBR(l.validade)}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-1">
                          {l.indicadorQuimicoOk === true ? (
                            <CheckCircle2
                              aria-hidden="true"
                              className="h-3 w-3 text-emerald-600"
                            />
                          ) : l.indicadorQuimicoOk === false ? (
                            <XCircle
                              aria-hidden="true"
                              className="h-3 w-3 text-red-600"
                            />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                          Q
                        </span>
                        <span className="flex items-center gap-1">
                          {l.indicadorBiologicoOk === true ? (
                            <CheckCircle2
                              aria-hidden="true"
                              className="h-3 w-3 text-emerald-600"
                            />
                          ) : l.indicadorBiologicoOk === false ? (
                            <XCircle
                              aria-hidden="true"
                              className="h-3 w-3 text-red-600"
                            />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                          B
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {l.qtdArtigos}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                          LOTE_STATUS_BADGE[l.status],
                        )}
                      >
                        {LOTE_STATUS_LABEL[l.status]}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/cme/lotes/${l.uuid}`)}
                        aria-label={`Ver lote ${l.numero}`}
                      >
                        <Eye aria-hidden="true" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {meta && meta.totalPages > 1 ? (
        <footer className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Página {meta.page} de {meta.totalPages} · {meta.total} lote(s)
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

LotesCmePage.displayName = 'LotesCmePage';
