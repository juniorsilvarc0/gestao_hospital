/**
 * GlosasListPage — listagem paginada de glosas.
 *
 * Filtros: status (multi), convênio, data, conta, origem, prazoVencido.
 * Tabela: data · conta · convênio · motivo · valor glosado · status · prazo
 *         (D-7/D-3/D-0/vencido) · ações.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Eye,
  FileWarning,
  Loader2,
  Plus,
  RefreshCw,
  Upload,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { listGlosas } from '@/lib/glosas-api';
import {
  GLOSA_ORIGENS,
  GLOSA_ORIGEM_LABEL,
  GLOSA_STATUSES,
  GLOSA_STATUS_BADGE,
  GLOSA_STATUS_LABEL,
  type GlosaOrigem,
  type GlosaStatus,
} from '@/types/glosas';
import { cn } from '@/lib/utils';

const PRAZO_OPTIONS = [
  { value: 'TODOS', label: 'Todos' },
  { value: 'D7', label: '≤ 7 dias' },
  { value: 'D3', label: '≤ 3 dias' },
  { value: 'D0', label: 'Vence hoje' },
  { value: 'VENCIDO', label: 'Vencido' },
] as const;

type PrazoFiltro = (typeof PRAZO_OPTIONS)[number]['value'];

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

function diasRestantes(prazo: string): number {
  const d = new Date(prazo);
  if (Number.isNaN(d.getTime())) return Number.NaN;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = target.getTime() - hoje.getTime();
  return Math.round(diff / 86400000);
}

function prazoBadge(dias: number): {
  label: string;
  className: string;
} {
  if (Number.isNaN(dias)) {
    return { label: '—', className: 'bg-muted text-muted-foreground border' };
  }
  if (dias < 0) {
    return {
      label: `Vencido (${Math.abs(dias)}d)`,
      className: 'bg-red-100 text-red-900 border-red-300',
    };
  }
  if (dias === 0) {
    return {
      label: 'D-0 (hoje)',
      className: 'bg-orange-200 text-orange-950 border-orange-400',
    };
  }
  if (dias <= 3) {
    return {
      label: `D-${dias}`,
      className: 'bg-orange-100 text-orange-900 border-orange-300',
    };
  }
  if (dias <= 7) {
    return {
      label: `D-${dias}`,
      className: 'bg-amber-100 text-amber-900 border-amber-300',
    };
  }
  return {
    label: `${dias}d`,
    className: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  };
}

export function GlosasListPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [statusSel, setStatusSel] = useState<Set<GlosaStatus>>(() => new Set());
  const [convenioUuid, setConvenioUuid] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [contaUuid, setContaUuid] = useState('');
  const [origem, setOrigem] = useState<'TODOS' | GlosaOrigem>('TODOS');
  const [prazoVencido, setPrazoVencido] = useState<PrazoFiltro>('TODOS');
  const [page, setPage] = useState(1);

  const params = useMemo(
    () => ({
      ...(statusSel.size > 0 ? { status: Array.from(statusSel) } : {}),
      ...(convenioUuid ? { convenioUuid } : {}),
      ...(dataInicio ? { dataInicio } : {}),
      ...(dataFim ? { dataFim } : {}),
      ...(contaUuid ? { contaUuid } : {}),
      ...(origem !== 'TODOS' ? { origem } : {}),
      ...(prazoVencido !== 'TODOS'
        ? { prazoVencido: prazoVencido as 'D7' | 'D3' | 'D0' | 'VENCIDO' }
        : {}),
      page,
      pageSize: 20,
    }),
    [
      statusSel,
      convenioUuid,
      dataInicio,
      dataFim,
      contaUuid,
      origem,
      prazoVencido,
      page,
    ],
  );

  const glosasQuery = useQuery({
    queryKey: ['glosas', 'list', params],
    queryFn: () => listGlosas(params),
    staleTime: 10_000,
  });

  function toggleStatus(s: GlosaStatus): void {
    setStatusSel((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
    setPage(1);
  }

  const linhas = glosasQuery.data?.data ?? [];
  const meta = glosasQuery.data?.meta;

  return (
    <section className="space-y-4" aria-label="Listagem de glosas">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <FileWarning aria-hidden="true" className="h-6 w-6" />
            Glosas
          </h1>
          <p className="text-sm text-muted-foreground">
            Acompanhamento do ciclo de glosas: recebida → recurso → revertida /
            acatada / perda.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              queryClient.invalidateQueries({ queryKey: ['glosas', 'list'] })
            }
          >
            <RefreshCw aria-hidden="true" />
            Atualizar
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigate('/glosas/importar')}
          >
            <Upload aria-hidden="true" />
            Importar TISS
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => navigate('/glosas/nova')}
          >
            <Plus aria-hidden="true" />
            Nova glosa
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="g-conv">Convênio (UUID)</Label>
              <Input
                id="g-conv"
                value={convenioUuid}
                onChange={(e) => {
                  setConvenioUuid(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="g-conta">Conta (UUID)</Label>
              <Input
                id="g-conta"
                value={contaUuid}
                onChange={(e) => {
                  setContaUuid(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="g-ini">Data início</Label>
              <Input
                id="g-ini"
                type="date"
                value={dataInicio}
                onChange={(e) => {
                  setDataInicio(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="g-fim">Data fim</Label>
              <Input
                id="g-fim"
                type="date"
                value={dataFim}
                onChange={(e) => {
                  setDataFim(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="g-orig">Origem</Label>
              <Select
                id="g-orig"
                value={origem}
                onChange={(e) => {
                  setOrigem(e.target.value as 'TODOS' | GlosaOrigem);
                  setPage(1);
                }}
              >
                <option value="TODOS">Todas</option>
                {GLOSA_ORIGENS.map((o) => (
                  <option key={o} value={o}>
                    {GLOSA_ORIGEM_LABEL[o]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="g-prazo">Prazo</Label>
              <Select
                id="g-prazo"
                value={prazoVencido}
                onChange={(e) => {
                  setPrazoVencido(e.target.value as PrazoFiltro);
                  setPage(1);
                }}
              >
                {PRAZO_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-md border bg-background p-2">
            <span className="mr-2 text-xs font-medium text-muted-foreground">
              Status:
            </span>
            {GLOSA_STATUSES.map((s) => {
              const active = statusSel.has(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleStatus(s)}
                  aria-pressed={active}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-all',
                    GLOSA_STATUS_BADGE[s],
                    active ? 'ring-2 ring-offset-1 ring-foreground' : 'opacity-60',
                  )}
                >
                  {GLOSA_STATUS_LABEL[s]}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-md border">
        <Table data-testid="glosas-tabela">
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Conta</TableHead>
              <TableHead>Convênio</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Prazo</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {glosasQuery.isLoading ? (
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
                  Nenhuma glosa para os filtros.
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((g) => {
                const dias = diasRestantes(g.prazoRecurso);
                const badge = prazoBadge(dias);
                const final =
                  g.status === 'REVERTIDA' ||
                  g.status === 'ACATADA' ||
                  g.status === 'PERDA_DEFINITIVA';
                return (
                  <TableRow key={g.uuid} data-testid={`glosa-row-${g.uuid}`}>
                    <TableCell className="text-xs">
                      {formatBR(g.dataGlosa)}
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      {g.contaNumero}
                    </TableCell>
                    <TableCell className="text-xs">
                      {g.convenioNome ?? g.convenioUuid}
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate text-xs">
                      {g.motivo}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {formatMoney(g.valorGlosado)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                          GLOSA_STATUS_BADGE[g.status],
                        )}
                      >
                        {GLOSA_STATUS_LABEL[g.status]}
                      </span>
                    </TableCell>
                    <TableCell>
                      {final ? (
                        <span className="text-xs text-muted-foreground">
                          —
                        </span>
                      ) : (
                        <span
                          data-testid={`prazo-${g.uuid}`}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                            badge.className,
                          )}
                        >
                          {dias < 0 ? (
                            <AlertCircle aria-hidden="true" className="h-3 w-3" />
                          ) : null}
                          {badge.label}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {GLOSA_ORIGEM_LABEL[g.origem]}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/glosas/${g.uuid}`)}
                        aria-label={`Ver glosa ${g.contaNumero}`}
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
            Página {meta.page} de {meta.totalPages} · {meta.total} glosas
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

GlosasListPage.displayName = 'GlosasListPage';
