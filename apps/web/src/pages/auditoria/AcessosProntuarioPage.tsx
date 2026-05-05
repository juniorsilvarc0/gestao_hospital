/**
 * AcessosProntuarioPage — quem acessou cada prontuário (LGPD-RN-LGP-01).
 *
 * Filtros: pacienteUuid, usuarioUuid, intervalo de datas. Tabela paginada.
 * Fonte: GET /v1/auditoria/acessos-prontuario.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Loader2, RefreshCw } from 'lucide-react';
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
import { listAcessosProntuario } from '@/lib/auditoria-api';

const PAGE_SIZE = 25;

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}

export function AcessosProntuarioPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [pacienteUuid, setPacienteUuid] = useState('');
  const [usuarioUuid, setUsuarioUuid] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [page, setPage] = useState(1);

  const params = useMemo(
    () => ({
      ...(pacienteUuid ? { pacienteUuid } : {}),
      ...(usuarioUuid ? { usuarioUuid } : {}),
      ...(dataInicio ? { dataInicio } : {}),
      ...(dataFim ? { dataFim } : {}),
      page,
      pageSize: PAGE_SIZE,
    }),
    [pacienteUuid, usuarioUuid, dataInicio, dataFim, page],
  );

  const acessosQuery = useQuery({
    queryKey: ['auditoria', 'acessos', params],
    queryFn: () => listAcessosProntuario(params),
    staleTime: 15_000,
  });

  const linhas = acessosQuery.data?.data ?? [];
  const meta = acessosQuery.data?.meta;

  return (
    <section
      className="space-y-4"
      aria-label="Auditoria — acessos a prontuário"
      data-testid="auditoria-acessos-page"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Eye aria-hidden="true" className="h-6 w-6" />
            Acessos a prontuário
          </h1>
          <p className="text-sm text-muted-foreground">
            LGPD RN-LGP-01 — registro nominal de quem consultou prontuário.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            queryClient.invalidateQueries({
              queryKey: ['auditoria', 'acessos'],
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="ac-pac">Paciente (UUID)</Label>
              <Input
                id="ac-pac"
                value={pacienteUuid}
                onChange={(e) => {
                  setPacienteUuid(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ac-user">Usuário (UUID)</Label>
              <Input
                id="ac-user"
                value={usuarioUuid}
                onChange={(e) => {
                  setUsuarioUuid(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ac-ini">Data início</Label>
              <Input
                id="ac-ini"
                type="date"
                value={dataInicio}
                onChange={(e) => {
                  setDataInicio(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ac-fim">Data fim</Label>
              <Input
                id="ac-fim"
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
        <Table data-testid="auditoria-acessos-tabela">
          <TableHeader>
            <TableRow>
              <TableHead>Quando</TableHead>
              <TableHead>Paciente</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>Finalidade</TableHead>
              <TableHead>Recurso</TableHead>
              <TableHead>IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {acessosQuery.isLoading ? (
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
                  Nenhum acesso para os filtros aplicados.
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((a) => (
                <TableRow key={a.uuid} data-testid={`acesso-row-${a.uuid}`}>
                  <TableCell className="text-xs tabular-nums">
                    {formatDateTime(a.ocorridoEm)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {a.pacienteNome ?? a.pacienteUuid}
                  </TableCell>
                  <TableCell className="text-xs">
                    {a.usuarioNome ?? a.usuarioUuid}
                  </TableCell>
                  <TableCell className="text-xs font-medium">
                    {a.finalidade}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {a.recurso ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {a.ip ?? '—'}
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
            Página {meta.page} de {meta.totalPages} · {meta.total} acesso(s)
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

AcessosProntuarioPage.displayName = 'AcessosProntuarioPage';
