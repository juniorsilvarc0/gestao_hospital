/**
 * SolicitacoesAdminPage — visão admin/DPO de solicitações LGPD do titular
 * (acesso, correção, exclusão, portabilidade) — Fase 13 R-C.
 *
 * Fonte: GET /v1/lgpd/solicitacoes
 * Filtros: tipo, status, paginação.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw, Scale } from 'lucide-react';
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
import { listSolicitacoesAdmin } from '@/lib/lgpd-api';
import {
  LGPD_SOLICITACAO_STATUSES,
  LGPD_SOLICITACAO_STATUS_BADGE,
  LGPD_SOLICITACAO_STATUS_LABEL,
  LGPD_SOLICITACAO_TIPOS,
  LGPD_SOLICITACAO_TIPO_LABEL,
  type LgpdSolicitacaoStatus,
  type LgpdSolicitacaoTipo,
} from '@/types/lgpd';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}

export function SolicitacoesAdminPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [tipo, setTipo] = useState<'TODOS' | LgpdSolicitacaoTipo>('TODOS');
  const [status, setStatus] = useState<'TODOS' | LgpdSolicitacaoStatus>(
    'TODOS',
  );
  const [pacienteUuid, setPacienteUuid] = useState('');
  const [page, setPage] = useState(1);

  const params = useMemo(
    () => ({
      ...(tipo !== 'TODOS' ? { tipo } : {}),
      ...(status !== 'TODOS' ? { status } : {}),
      ...(pacienteUuid ? { pacienteUuid } : {}),
      page,
      pageSize: PAGE_SIZE,
    }),
    [tipo, status, pacienteUuid, page],
  );

  const solicitacoesQuery = useQuery({
    queryKey: ['lgpd-admin', 'solicitacoes', params],
    queryFn: () => listSolicitacoesAdmin(params),
    staleTime: 15_000,
  });

  const linhas = solicitacoesQuery.data?.data ?? [];
  const meta = solicitacoesQuery.data?.meta;

  return (
    <section
      className="space-y-4"
      aria-label="LGPD — solicitações (admin)"
      data-testid="lgpd-solicitacoes-admin-page"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Scale aria-hidden="true" className="h-6 w-6" />
            Solicitações LGPD (admin)
          </h1>
          <p className="text-sm text-muted-foreground">
            Solicitações de acesso, correção, exclusão ou portabilidade enviadas
            pelos titulares.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            queryClient.invalidateQueries({
              queryKey: ['lgpd-admin', 'solicitacoes'],
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
              <Label htmlFor="sol-tipo">Tipo</Label>
              <Select
                id="sol-tipo"
                value={tipo}
                onChange={(e) => {
                  setTipo(e.target.value as 'TODOS' | LgpdSolicitacaoTipo);
                  setPage(1);
                }}
              >
                <option value="TODOS">Todos</option>
                {LGPD_SOLICITACAO_TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {LGPD_SOLICITACAO_TIPO_LABEL[t]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="sol-status">Status</Label>
              <Select
                id="sol-status"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as 'TODOS' | LgpdSolicitacaoStatus);
                  setPage(1);
                }}
              >
                <option value="TODOS">Todos</option>
                {LGPD_SOLICITACAO_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {LGPD_SOLICITACAO_STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="sol-pac">Paciente (UUID)</Label>
              <Input
                id="sol-pac"
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
        <Table data-testid="lgpd-solicitacoes-tabela">
          <TableHeader>
            <TableRow>
              <TableHead>Aberta em</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Paciente</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Atendida em</TableHead>
              <TableHead>Atendida por</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {solicitacoesQuery.isLoading ? (
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
                  Nenhuma solicitação para os filtros aplicados.
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((s) => {
                const st = s.status as LgpdSolicitacaoStatus;
                const badgeCls =
                  LGPD_SOLICITACAO_STATUS_BADGE[st] ??
                  'bg-zinc-100 text-zinc-900 border-zinc-300';
                const stLabel =
                  LGPD_SOLICITACAO_STATUS_LABEL[st] ?? String(s.status);
                const tipoLabel =
                  LGPD_SOLICITACAO_TIPO_LABEL[s.tipo as LgpdSolicitacaoTipo] ??
                  String(s.tipo);
                return (
                  <TableRow
                    key={s.uuid}
                    data-testid={`solicitacao-row-${s.uuid}`}
                  >
                    <TableCell className="text-xs tabular-nums">
                      {formatDateTime(s.abertaEm)}
                    </TableCell>
                    <TableCell className="text-xs">{tipoLabel}</TableCell>
                    <TableCell className="text-xs">
                      {s.pacienteNome ?? s.pacienteUuid}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                          badgeCls,
                        )}
                      >
                        {stLabel}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {formatDateTime(s.atendidaEm)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {s.atendidaPor ?? '—'}
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
            Página {meta.page} de {meta.totalPages} · {meta.total}{' '}
            solicitação(ões)
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

SolicitacoesAdminPage.displayName = 'SolicitacoesAdminPage';
