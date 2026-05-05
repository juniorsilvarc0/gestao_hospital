/**
 * EventosPage — auditoria_eventos (Fase 13 R-A consumer).
 *
 * Lista paginada de eventos de auditoria com filtros (tabela, finalidade,
 * usuárioUuid, intervalo de datas) e tabela com diff JSONB renderizado
 * inline (linha expansível).
 *
 * Fonte: GET /v1/auditoria/eventos.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
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
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { listEventos } from '@/lib/auditoria-api';

const PAGE_SIZE = 25;

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}

export function EventosPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [tabela, setTabela] = useState('');
  const [finalidade, setFinalidade] = useState('');
  const [usuarioUuid, setUsuarioUuid] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [page, setPage] = useState(1);
  const [expandido, setExpandido] = useState<Set<string>>(() => new Set());

  const params = useMemo(
    () => ({
      ...(tabela ? { tabela } : {}),
      ...(finalidade ? { finalidade } : {}),
      ...(usuarioUuid ? { usuarioUuid } : {}),
      ...(dataInicio ? { dataInicio } : {}),
      ...(dataFim ? { dataFim } : {}),
      page,
      pageSize: PAGE_SIZE,
    }),
    [tabela, finalidade, usuarioUuid, dataInicio, dataFim, page],
  );

  const eventosQuery = useQuery({
    queryKey: ['auditoria', 'eventos', params],
    queryFn: () => listEventos(params),
    staleTime: 15_000,
  });

  function toggleExpandir(uuid: string): void {
    setExpandido((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  }

  const linhas = eventosQuery.data?.data ?? [];
  const meta = eventosQuery.data?.meta;

  return (
    <section
      className="space-y-4"
      aria-label="Auditoria — eventos"
      data-testid="auditoria-eventos-page"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ClipboardList aria-hidden="true" className="h-6 w-6" />
            Auditoria — Eventos
          </h1>
          <p className="text-sm text-muted-foreground">
            Trilha LGPD: quem alterou o quê, quando e com qual finalidade.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            queryClient.invalidateQueries({
              queryKey: ['auditoria', 'eventos'],
            })
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
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1">
              <Label htmlFor="ev-tab">Tabela</Label>
              <Input
                id="ev-tab"
                value={tabela}
                placeholder="pacientes, prescricoes..."
                onChange={(e) => {
                  setTabela(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ev-fin">Finalidade</Label>
              <Input
                id="ev-fin"
                value={finalidade}
                placeholder="ATENDIMENTO, FATURAMENTO..."
                onChange={(e) => {
                  setFinalidade(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ev-user">Usuário (UUID)</Label>
              <Input
                id="ev-user"
                value={usuarioUuid}
                onChange={(e) => {
                  setUsuarioUuid(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ev-ini">Data início</Label>
              <Input
                id="ev-ini"
                type="date"
                value={dataInicio}
                onChange={(e) => {
                  setDataInicio(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ev-fim">Data fim</Label>
              <Input
                id="ev-fim"
                type="date"
                value={dataFim}
                onChange={(e) => {
                  setDataFim(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-md border">
        <Table data-testid="auditoria-eventos-tabela">
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" aria-label="Expandir" />
              <TableHead>Quando</TableHead>
              <TableHead>Tabela</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Registro</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>Finalidade</TableHead>
              <TableHead>IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {eventosQuery.isLoading ? (
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
                  Nenhum evento para os filtros aplicados.
                </TableCell>
              </TableRow>
            ) : (
              linhas.flatMap((ev) => {
                const aberto = expandido.has(ev.uuid);
                const rows = [
                  <TableRow key={ev.uuid} data-testid={`evento-row-${ev.uuid}`}>
                      <TableCell>
                        <button
                          type="button"
                          aria-expanded={aberto}
                          aria-label={aberto ? 'Recolher diff' : 'Expandir diff'}
                          onClick={() => toggleExpandir(ev.uuid)}
                          className="rounded p-1 hover:bg-accent"
                        >
                          {aberto ? (
                            <ChevronDown aria-hidden="true" className="h-4 w-4" />
                          ) : (
                            <ChevronRight aria-hidden="true" className="h-4 w-4" />
                          )}
                        </button>
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {formatDateTime(ev.ocorridoEm)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {ev.tabela}
                      </TableCell>
                      <TableCell className="text-xs">{ev.acao}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {ev.registroId}
                      </TableCell>
                      <TableCell className="text-xs">
                        {ev.usuarioNome ?? ev.usuarioUuid ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {ev.finalidade ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {ev.ip ?? '—'}
                      </TableCell>
                    </TableRow>,
                ];
                if (aberto) {
                  rows.push(
                    <TableRow
                      key={`${ev.uuid}-diff`}
                      data-testid={`evento-diff-${ev.uuid}`}
                    >
                      <TableCell colSpan={8} className="bg-muted/30">
                        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded bg-background p-3 text-[11px]">
                          {ev.diff
                            ? JSON.stringify(ev.diff, null, 2)
                            : '(sem diff)'}
                        </pre>
                      </TableCell>
                    </TableRow>,
                  );
                }
                return rows;
              })
            )}
          </TableBody>
        </Table>
      </div>

      {meta && meta.totalPages > 1 ? (
        <footer className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Página {meta.page} de {meta.totalPages} · {meta.total} evento(s)
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

EventosPage.displayName = 'EventosPage';
