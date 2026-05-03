/**
 * CasosListPage — listagem paginada de casos CCIH (Fase 10).
 *
 * Filtros: status (multi), setor (UUID), microorganismo (texto), data range.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Eye,
  Loader2,
  Plus,
  RefreshCw,
  ShieldAlert,
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
import { listCasos } from '@/lib/ccih-api';
import {
  CCIH_STATUSES,
  CCIH_STATUS_BADGE,
  CCIH_STATUS_LABEL,
  ORIGEM_INFECCAO_LABEL,
  type CcihStatus,
} from '@/types/ccih';
import { cn } from '@/lib/utils';

function formatBR(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

export function CasosListPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [statusSel, setStatusSel] = useState<Set<CcihStatus>>(() => new Set());
  const [setorUuid, setSetorUuid] = useState('');
  const [microorganismo, setMicroorganismo] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [page, setPage] = useState(1);

  const params = useMemo(
    () => ({
      ...(statusSel.size > 0 ? { status: Array.from(statusSel) } : {}),
      ...(setorUuid ? { setorUuid } : {}),
      ...(microorganismo ? { microorganismo } : {}),
      ...(dataInicio ? { dataInicio } : {}),
      ...(dataFim ? { dataFim } : {}),
      page,
      pageSize: 20,
    }),
    [statusSel, setorUuid, microorganismo, dataInicio, dataFim, page],
  );

  const casosQuery = useQuery({
    queryKey: ['ccih', 'casos', 'list', params],
    queryFn: () => listCasos(params),
    staleTime: 15_000,
  });

  function toggleStatus(s: CcihStatus): void {
    setStatusSel((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
    setPage(1);
  }

  const linhas = casosQuery.data?.data ?? [];
  const meta = casosQuery.data?.meta;

  return (
    <section className="space-y-4" aria-label="Listagem de casos CCIH">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ShieldAlert aria-hidden="true" className="h-6 w-6" />
            Casos CCIH
          </h1>
          <p className="text-sm text-muted-foreground">
            IRAS e infecções: ABERTO → EM_INVESTIGACAO → NOTIFICADO → ENCERRADO.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              queryClient.invalidateQueries({
                queryKey: ['ccih', 'casos', 'list'],
              })
            }
          >
            <RefreshCw aria-hidden="true" />
            Atualizar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => navigate('/ccih/casos/novo')}
          >
            <Plus aria-hidden="true" />
            Novo Caso
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
              <Label htmlFor="cc-setor">Setor (UUID)</Label>
              <Input
                id="cc-setor"
                value={setorUuid}
                onChange={(e) => {
                  setSetorUuid(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cc-micro">Microorganismo</Label>
              <Input
                id="cc-micro"
                value={microorganismo}
                onChange={(e) => {
                  setMicroorganismo(e.target.value);
                  setPage(1);
                }}
                placeholder="Ex.: K. pneumoniae"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cc-di">Data início</Label>
              <Input
                id="cc-di"
                type="date"
                value={dataInicio}
                onChange={(e) => {
                  setDataInicio(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cc-df">Data fim</Label>
              <Input
                id="cc-df"
                type="date"
                value={dataFim}
                onChange={(e) => {
                  setDataFim(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-md border bg-background p-2">
            <span className="mr-2 text-xs font-medium text-muted-foreground">
              Status:
            </span>
            {CCIH_STATUSES.map((s) => {
              const active = statusSel.has(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleStatus(s)}
                  aria-pressed={active}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-all',
                    CCIH_STATUS_BADGE[s],
                    active ? 'ring-2 ring-offset-1 ring-foreground' : 'opacity-60',
                  )}
                >
                  {CCIH_STATUS_LABEL[s]}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-md border">
        <Table data-testid="casos-ccih-tabela">
          <TableHeader>
            <TableRow>
              <TableHead>Paciente</TableHead>
              <TableHead>Setor</TableHead>
              <TableHead>Diagnóstico</TableHead>
              <TableHead>Topografia</TableHead>
              <TableHead>Microorganismo</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {casosQuery.isLoading ? (
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
                  Nenhum caso para os filtros.
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((c) => (
                <TableRow key={c.uuid} data-testid={`caso-row-${c.uuid}`}>
                  <TableCell className="text-xs">
                    {c.pacienteNome ?? c.pacienteUuid}
                  </TableCell>
                  <TableCell className="text-xs">
                    {c.setorNome ?? c.setorUuid}
                  </TableCell>
                  <TableCell className="text-xs">
                    {formatBR(c.dataDiagnostico)}
                  </TableCell>
                  <TableCell className="text-xs">{c.topografia ?? '—'}</TableCell>
                  <TableCell className="text-xs italic">
                    {c.microorganismo ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs">
                    {c.origemInfeccao ? ORIGEM_INFECCAO_LABEL[c.origemInfeccao] : '—'}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                        CCIH_STATUS_BADGE[c.status],
                      )}
                    >
                      {CCIH_STATUS_LABEL[c.status]}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/ccih/casos/${c.uuid}`)}
                      aria-label={`Ver caso de ${c.pacienteNome ?? c.pacienteUuid}`}
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
            Página {meta.page} de {meta.totalPages} · {meta.total} caso(s)
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

CasosListPage.displayName = 'CasosListPage';
