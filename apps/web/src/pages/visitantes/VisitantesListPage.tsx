/**
 * VisitantesListPage — listagem paginada de visitantes (Fase 10).
 *
 * Filtros: nome (debounced), bloqueado (toggle).
 *
 * Privacidade: exibe apenas CPF mascarado (últimos 4 dígitos).
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Eye,
  Loader2,
  Plus,
  RefreshCw,
  ShieldOff,
  Users,
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
import { listVisitantes } from '@/lib/visitantes-api';
import { useDebouncedValue } from '@/lib/use-debounced-value';

export function VisitantesListPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [nome, setNome] = useState('');
  const [apenasBloqueados, setApenasBloqueados] = useState(false);
  const [page, setPage] = useState(1);

  const debouncedNome = useDebouncedValue(nome, 350);

  const params = useMemo(
    () => ({
      ...(debouncedNome ? { nome: debouncedNome } : {}),
      ...(apenasBloqueados ? { bloqueado: true } : {}),
      page,
      pageSize: 20,
    }),
    [debouncedNome, apenasBloqueados, page],
  );

  const visQuery = useQuery({
    queryKey: ['visitantes', 'list', params],
    queryFn: () => listVisitantes(params),
    staleTime: 15_000,
  });

  const linhas = visQuery.data?.data ?? [];
  const meta = visQuery.data?.meta;

  return (
    <section className="space-y-4" aria-label="Listagem de visitantes">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Users aria-hidden="true" className="h-6 w-6" />
            Visitantes
          </h1>
          <p className="text-sm text-muted-foreground">
            Cadastro de visitantes — bloqueios respeitam RN-VIS-03.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              queryClient.invalidateQueries({ queryKey: ['visitantes', 'list'] })
            }
          >
            <RefreshCw aria-hidden="true" />
            Atualizar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => navigate('/visitantes/novo')}
          >
            <Plus aria-hidden="true" />
            Novo
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="vis-nome">Nome</Label>
              <Input
                id="vis-nome"
                value={nome}
                onChange={(e) => {
                  setNome(e.target.value);
                  setPage(1);
                }}
                placeholder="Buscar por nome"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={apenasBloqueados}
                  onChange={(e) => {
                    setApenasBloqueados(e.target.checked);
                    setPage(1);
                  }}
                  className="h-4 w-4 rounded border-input"
                />
                Apenas bloqueados
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-md border">
        <Table data-testid="visitantes-tabela">
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>CPF</TableHead>
              <TableHead>Bloqueado</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="py-6 text-center text-sm">
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
                  colSpan={4}
                  className="py-6 text-center text-sm text-muted-foreground"
                >
                  Nenhum visitante para os filtros.
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((v) => (
                <TableRow key={v.uuid} data-testid={`visitante-row-${v.uuid}`}>
                  <TableCell className="text-sm">{v.nome}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {v.cpfMascarado}
                  </TableCell>
                  <TableCell>
                    {v.bloqueado ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-900">
                        <ShieldOff aria-hidden="true" className="h-3 w-3" />
                        Bloqueado
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/visitantes/${v.uuid}`)}
                      aria-label={`Ver visitante ${v.nome}`}
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
            Página {meta.page} de {meta.totalPages} · {meta.total} visitante(s)
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

VisitantesListPage.displayName = 'VisitantesListPage';
