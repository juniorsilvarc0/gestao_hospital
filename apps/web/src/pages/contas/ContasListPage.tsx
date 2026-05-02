/**
 * ContasListPage — listagem paginada de contas hospitalares.
 *
 * Filtros: status (multi), convênio (UUID), data abertura (período), número.
 * Tabela: número · paciente · atendimento · convênio · status · valor total ·
 *         valor líquido · ações (Ver / Espelho).
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Eye,
  FileText,
  Loader2,
  Receipt,
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
import { getEspelhoUrl, listContas } from '@/lib/contas-api';
import {
  CONTA_STATUSES,
  CONTA_STATUS_BADGE,
  CONTA_STATUS_LABEL,
  type ContaStatus,
} from '@/types/contas';
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
    minimumFractionDigits: 2,
  });
}

export function ContasListPage(): JSX.Element {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [statusSel, setStatusSel] = useState<Set<ContaStatus>>(() => new Set());
  const [convenioUuid, setConvenioUuid] = useState('');
  const [numero, setNumero] = useState('');
  const [dataAbertura, setDataAbertura] = useState('');
  const [dataAberturaFim, setDataAberturaFim] = useState('');
  const [page, setPage] = useState(1);

  const params = useMemo(
    () => ({
      ...(statusSel.size > 0 ? { status: Array.from(statusSel) } : {}),
      ...(convenioUuid ? { convenioUuid } : {}),
      ...(numero ? { numero } : {}),
      ...(dataAbertura ? { dataAbertura } : {}),
      ...(dataAberturaFim ? { dataAberturaFim } : {}),
      page,
      pageSize: 20,
    }),
    [statusSel, convenioUuid, numero, dataAbertura, dataAberturaFim, page],
  );

  const contasQuery = useQuery({
    queryKey: ['contas', 'list', params],
    queryFn: () => listContas(params),
    staleTime: 10_000,
  });

  function toggleStatus(s: ContaStatus): void {
    setStatusSel((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
    setPage(1);
  }

  const linhas = contasQuery.data?.data ?? [];
  const meta = contasQuery.data?.meta;

  return (
    <section className="space-y-4" aria-label="Listagem de contas">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Receipt aria-hidden="true" className="h-6 w-6" />
            Contas hospitalares
          </h1>
          <p className="text-sm text-muted-foreground">
            Ciclo: aberta → em elaboração → fechada → faturada → glosada/paga.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            queryClient.invalidateQueries({ queryKey: ['contas', 'list'] })
          }
        >
          <RefreshCw aria-hidden="true" />
          Atualizar
        </Button>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="contas-numero">Número</Label>
              <Input
                id="contas-numero"
                value={numero}
                onChange={(e) => {
                  setNumero(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="contas-conv">Convênio (UUID)</Label>
              <Input
                id="contas-conv"
                value={convenioUuid}
                onChange={(e) => {
                  setConvenioUuid(e.target.value);
                  setPage(1);
                }}
                placeholder="uuid"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="contas-dt-ini">Abertura desde</Label>
              <Input
                id="contas-dt-ini"
                type="date"
                value={dataAbertura}
                onChange={(e) => {
                  setDataAbertura(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="contas-dt-fim">Abertura até</Label>
              <Input
                id="contas-dt-fim"
                type="date"
                value={dataAberturaFim}
                onChange={(e) => {
                  setDataAberturaFim(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-md border bg-background p-2">
            <span className="mr-2 text-xs font-medium text-muted-foreground">
              Status:
            </span>
            {CONTA_STATUSES.map((s) => {
              const active = statusSel.has(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleStatus(s)}
                  aria-pressed={active}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-all',
                    CONTA_STATUS_BADGE[s],
                    active ? 'ring-2 ring-offset-1 ring-foreground' : 'opacity-60',
                  )}
                >
                  {CONTA_STATUS_LABEL[s]}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-md border">
        <Table data-testid="contas-tabela">
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Paciente</TableHead>
              <TableHead>Atendimento</TableHead>
              <TableHead>Convênio</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Abertura</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Líquido</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contasQuery.isLoading ? (
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
                  Nenhuma conta para os filtros.
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((c) => (
                <TableRow key={c.uuid} data-testid={`conta-row-${c.uuid}`}>
                  <TableCell className="text-xs font-medium">
                    {c.numero}
                  </TableCell>
                  <TableCell className="text-xs">{c.pacienteNome}</TableCell>
                  <TableCell className="text-xs">
                    {c.atendimentoNumero}
                  </TableCell>
                  <TableCell className="text-xs">{c.convenioNome}</TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                        CONTA_STATUS_BADGE[c.status],
                      )}
                    >
                      {CONTA_STATUS_LABEL[c.status]}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">
                    {formatBR(c.dataAbertura)}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {formatMoney(c.valorTotal)}
                  </TableCell>
                  <TableCell className="text-right text-xs font-semibold tabular-nums">
                    {formatMoney(c.valorLiquido)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/contas/${c.uuid}`)}
                        aria-label={`Ver conta ${c.numero}`}
                      >
                        <Eye aria-hidden="true" />
                      </Button>
                      <a
                        href={getEspelhoUrl(c.uuid, 'pdf')}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Espelho da conta ${c.numero}`}
                      >
                        <Button type="button" size="sm" variant="outline">
                          <FileText aria-hidden="true" />
                        </Button>
                      </a>
                    </div>
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
            Página {meta.page} de {meta.totalPages} · {meta.total} contas
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

ContasListPage.displayName = 'ContasListPage';
