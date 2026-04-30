/**
 * PacientesListPage — lista paginada com busca debounced.
 *
 * - Busca por nome / CPF / código (q debounced 350ms).
 * - Paginação: ?page e ?pageSize.
 * - Header X-Finalidade='CONSULTA' default (ver pacientes-api.ts).
 *
 * Loading: skeleton screen.
 * Empty state: mensagem com CTA para criar.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, Users } from 'lucide-react';
import {
  Button,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { listPacientes } from '@/lib/pacientes-api';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { Cpf } from '@/lib/document-validators';
import { useToast } from '@/components/Toast';
import { ApiError } from '@/lib/api-client';

const PAGE_SIZE = 20;

function formatDate(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

export function PacientesListPage(): JSX.Element {
  const navigate = useNavigate();
  const { show: showToast } = useToast();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const debouncedQuery = useDebouncedValue(query, 350);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['pacientes', { q: debouncedQuery, page, pageSize: PAGE_SIZE }],
    queryFn: () =>
      listPacientes({
        q: debouncedQuery,
        page,
        pageSize: PAGE_SIZE,
      }),
    staleTime: 30_000,
  });

  if (isError && error instanceof ApiError) {
    showToast({
      variant: 'destructive',
      title: 'Falha ao carregar pacientes',
      description: error.detail ?? error.message,
      durationMs: 5000,
    });
  }

  const totalPages = data?.meta.totalPages ?? 1;
  const total = data?.meta.total ?? 0;

  return (
    <section className="space-y-4" aria-label="Pacientes">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Users aria-hidden="true" className="h-6 w-6" />
            Pacientes
          </h1>
          <p className="text-sm text-muted-foreground">
            {total} resultado{total === 1 ? '' : 's'}
            {debouncedQuery ? ` para "${debouncedQuery}"` : ''}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative">
            <Search
              aria-hidden="true"
              className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              aria-label="Buscar pacientes por nome, CPF ou código"
              placeholder="Buscar por nome, CPF ou código..."
              className="pl-8 sm:w-72"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <Button asChild>
            <Link to="/pacientes/novo">
              <Plus aria-hidden="true" />
              Novo paciente
            </Link>
          </Button>
        </div>
      </header>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>CPF</TableHead>
              <TableHead>Nascimento</TableHead>
              <TableHead>Sexo</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, idx) => (
                <TableRow key={`s-${idx}`}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : data && data.data.length > 0 ? (
              data.data.map((p) => (
                <TableRow
                  key={p.uuid}
                  className="cursor-pointer"
                  onClick={() => navigate(`/pacientes/${p.uuid}`)}
                >
                  <TableCell className="font-mono text-xs">{p.codigo}</TableCell>
                  <TableCell className="font-medium">
                    {p.nomeSocial ?? p.nome}
                  </TableCell>
                  <TableCell>
                    {p.cpf ? Cpf.format(p.cpf) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>{formatDate(p.dataNascimento)}</TableCell>
                  <TableCell>{p.sexo}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      asChild
                      variant="link"
                      size="sm"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Link to={`/pacientes/${p.uuid}/editar`}>Editar</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                    <Users
                      aria-hidden="true"
                      className="h-8 w-8 text-muted-foreground"
                    />
                    <p className="text-sm text-muted-foreground">
                      Nenhum paciente encontrado.
                    </p>
                    <Button asChild variant="outline" size="sm">
                      <Link to="/pacientes/novo">Cadastrar paciente</Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {data && totalPages > 1 ? (
        <nav
          aria-label="Paginação"
          className="flex items-center justify-between text-sm"
        >
          <span className="text-muted-foreground">
            Página {data.meta.page} de {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Próxima
            </Button>
          </div>
        </nav>
      ) : null}
    </section>
  );
}
