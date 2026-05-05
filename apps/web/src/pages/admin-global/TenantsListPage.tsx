/**
 * TenantsListPage — admin global de tenants (Fase 13 R-C).
 *
 * Fonte: GET /v1/admin/tenants
 * Ações: criar (link), editar (link), ativar / desativar (mutations).
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Loader2,
  Pencil,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
} from 'lucide-react';
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
import { useToast } from '@/components/Toast';
import {
  ativarTenant,
  desativarTenant,
  listTenants,
} from '@/lib/admin-api';
import {
  TENANT_STATUSES,
  TENANT_STATUS_BADGE,
  TENANT_STATUS_LABEL,
  type TenantStatus,
} from '@/types/admin';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}

export function TenantsListPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();
  const [status, setStatus] = useState<'TODOS' | TenantStatus>('TODOS');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const params = useMemo(
    () => ({
      ...(status !== 'TODOS' ? { status } : {}),
      ...(search ? { search } : {}),
      page,
      pageSize: PAGE_SIZE,
    }),
    [status, search, page],
  );

  const tenantsQuery = useQuery({
    queryKey: ['admin', 'tenants', params],
    queryFn: () => listTenants(params),
    staleTime: 15_000,
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] });
  }

  const ativarMutation = useMutation({
    mutationFn: (uuid: string) => ativarTenant(uuid),
    onSuccess: () => {
      showToast({
        title: 'Tenant ativado',
        description: 'O tenant agora aceita logins.',
        variant: 'success',
        durationMs: 2500,
      });
      invalidate();
    },
    onError: (err) => {
      showToast({
        title: 'Falha ao ativar',
        description: err instanceof Error ? err.message : 'Erro desconhecido.',
        variant: 'destructive',
        durationMs: 4500,
      });
    },
  });

  const desativarMutation = useMutation({
    mutationFn: (uuid: string) => desativarTenant(uuid),
    onSuccess: () => {
      showToast({
        title: 'Tenant desativado',
        description: 'Sessões existentes seguem válidas até expirarem.',
        variant: 'success',
        durationMs: 2500,
      });
      invalidate();
    },
    onError: (err) => {
      showToast({
        title: 'Falha ao desativar',
        description: err instanceof Error ? err.message : 'Erro desconhecido.',
        variant: 'destructive',
        durationMs: 4500,
      });
    },
  });

  const linhas = tenantsQuery.data?.data ?? [];
  const meta = tenantsQuery.data?.meta;

  return (
    <section
      className="space-y-4"
      aria-label="Admin — tenants"
      data-testid="admin-tenants-page"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Building2 aria-hidden="true" className="h-6 w-6" />
            Tenants
          </h1>
          <p className="text-sm text-muted-foreground">
            Multi-tenant — cada tenant é um hospital ou grupo isolado por
            `tenant_id` em todas as tabelas.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={invalidate}
          >
            <RefreshCw aria-hidden="true" />
            Atualizar
          </Button>
          <Button type="button" size="sm" asChild>
            <Link to="/admin/tenants/novo">
              <Plus aria-hidden="true" />
              Novo tenant
            </Link>
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="ten-status">Status</Label>
              <Select
                id="ten-status"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as 'TODOS' | TenantStatus);
                  setPage(1);
                }}
              >
                <option value="TODOS">Todos</option>
                {TENANT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {TENANT_STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="ten-search">Buscar (nome, código)</Label>
              <Input
                id="ten-search"
                value={search}
                placeholder="ex.: hospital-x, hsx, ..."
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-md border">
        <Table data-testid="admin-tenants-tabela">
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>CNPJ</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Usuários</TableHead>
              <TableHead>Pacientes</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead className="w-44">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenantsQuery.isLoading ? (
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
                  Nenhum tenant para os filtros aplicados.
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((t) => {
                const ts = t.status as TenantStatus;
                const badgeCls =
                  TENANT_STATUS_BADGE[ts] ??
                  'bg-zinc-100 text-zinc-900 border-zinc-300';
                const stLabel =
                  TENANT_STATUS_LABEL[ts] ?? String(t.status);
                const isAtivo = ts === 'ATIVO';
                const busy =
                  ativarMutation.isPending || desativarMutation.isPending;
                return (
                  <TableRow
                    key={t.uuid}
                    data-testid={`tenant-row-${t.uuid}`}
                  >
                    <TableCell className="font-mono text-xs">
                      {t.codigo}
                    </TableCell>
                    <TableCell className="text-xs">{t.nome}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {t.cnpj ?? '—'}
                    </TableCell>
                    <TableCell>
                      <span
                        data-testid={`tenant-badge-${t.uuid}`}
                        className={cn(
                          'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                          badgeCls,
                        )}
                      >
                        {stLabel}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {t.usuariosAtivos ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {t.pacientesAtivos ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {formatDateTime(t.criadoEm)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          asChild
                        >
                          <Link to={`/admin/tenants/${t.uuid}`}>
                            <Pencil aria-hidden="true" />
                          </Link>
                        </Button>
                        {isAtivo ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            data-testid={`btn-desativar-${t.uuid}`}
                            onClick={() => desativarMutation.mutate(t.uuid)}
                          >
                            <PowerOff aria-hidden="true" />
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            data-testid={`btn-ativar-${t.uuid}`}
                            onClick={() => ativarMutation.mutate(t.uuid)}
                          >
                            <Power aria-hidden="true" />
                          </Button>
                        )}
                      </div>
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
            Página {meta.page} de {meta.totalPages} · {meta.total} tenant(s)
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

TenantsListPage.displayName = 'TenantsListPage';
