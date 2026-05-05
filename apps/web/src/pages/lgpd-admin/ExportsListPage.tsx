/**
 * ExportsListPage — lista de lgpd_exports (Fase 13 R-C).
 *
 * Lifecycle dual approval (RN-LGP-04): PENDENTE → APROVADO_DPO →
 * APROVADO_SUPERVISOR → PRONTO → GERADO. Em qualquer ponto pode ir para
 * REJEITADO.
 *
 * Fonte: GET /v1/lgpd/exports
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
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
import { listExports } from '@/lib/lgpd-api';
import {
  LGPD_EXPORT_STATUSES,
  LGPD_EXPORT_STATUS_BADGE,
  LGPD_EXPORT_STATUS_LABEL,
  type LgpdExportStatus,
} from '@/types/lgpd';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}

export function ExportsListPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'TODOS' | LgpdExportStatus>('TODOS');
  const [pacienteUuid, setPacienteUuid] = useState('');
  const [page, setPage] = useState(1);

  const params = useMemo(
    () => ({
      ...(status !== 'TODOS' ? { status } : {}),
      ...(pacienteUuid ? { pacienteUuid } : {}),
      page,
      pageSize: PAGE_SIZE,
    }),
    [status, pacienteUuid, page],
  );

  const exportsQuery = useQuery({
    queryKey: ['lgpd-admin', 'exports', params],
    queryFn: () => listExports(params),
    staleTime: 15_000,
  });

  const linhas = exportsQuery.data?.data ?? [];
  const meta = exportsQuery.data?.meta;

  return (
    <section
      className="space-y-4"
      aria-label="LGPD — exports"
      data-testid="lgpd-exports-page"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Download aria-hidden="true" className="h-6 w-6" />
            Exportações LGPD
          </h1>
          <p className="text-sm text-muted-foreground">
            Pacotes FHIR Bundle gerados após dupla aprovação (DPO + Supervisor).
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            queryClient.invalidateQueries({
              queryKey: ['lgpd-admin', 'exports'],
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="exp-status">Status</Label>
              <Select
                id="exp-status"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as 'TODOS' | LgpdExportStatus);
                  setPage(1);
                }}
              >
                <option value="TODOS">Todos</option>
                {LGPD_EXPORT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {LGPD_EXPORT_STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="exp-pac">Paciente (UUID)</Label>
              <Input
                id="exp-pac"
                value={pacienteUuid}
                onChange={(e) => {
                  setPacienteUuid(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-md border">
        <Table data-testid="lgpd-exports-tabela">
          <TableHeader>
            <TableRow>
              <TableHead>Criado em</TableHead>
              <TableHead>Paciente</TableHead>
              <TableHead>Finalidade</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Aprovações</TableHead>
              <TableHead className="w-32">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {exportsQuery.isLoading ? (
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
                  Nenhum export para os filtros aplicados.
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((e) => {
                const st = e.status as LgpdExportStatus;
                const badgeCls =
                  LGPD_EXPORT_STATUS_BADGE[st] ??
                  'bg-zinc-100 text-zinc-900 border-zinc-300';
                const stLabel =
                  LGPD_EXPORT_STATUS_LABEL[st] ?? String(e.status);
                return (
                  <TableRow
                    key={e.uuid}
                    data-testid={`export-row-${e.uuid}`}
                  >
                    <TableCell className="text-xs tabular-nums">
                      {formatDateTime(e.criadoEm)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {e.pacienteNome ?? e.pacienteUuid}
                    </TableCell>
                    <TableCell className="text-xs">{e.finalidade}</TableCell>
                    <TableCell>
                      <span
                        data-testid={`export-badge-${e.uuid}`}
                        className={cn(
                          'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                          badgeCls,
                        )}
                      >
                        {stLabel}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="space-y-0.5">
                        <div>
                          <span className="text-muted-foreground">DPO:</span>{' '}
                          {e.aprovadorDpoNome ?? '—'}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Sup.:</span>{' '}
                          {e.aprovadorSupervisorNome ?? '—'}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        asChild
                      >
                        <Link to={`/lgpd-admin/exports/${e.uuid}`}>
                          Detalhes
                        </Link>
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
            Página {meta.page} de {meta.totalPages} · {meta.total} export(s)
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

ExportsListPage.displayName = 'ExportsListPage';
