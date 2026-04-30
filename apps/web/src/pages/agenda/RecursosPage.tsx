/**
 * RecursosPage — listagem simples dos `agendas_recursos`.
 *
 * Tela placeholder para acessar/visualizar a base de recursos. CRUD completo
 * fica para a fase de configuração (cadastros — Trilha A da Fase 3 cobre
 * o backend; aqui só lemos).
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, Search, Stethoscope } from 'lucide-react';
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
import { listRecursos } from '@/lib/agenda-api';
import { useDebouncedValue } from '@/lib/use-debounced-value';

const PAGE_SIZE = 50;

export function RecursosPage(): JSX.Element {
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 300);

  const { data, isLoading } = useQuery({
    queryKey: ['recursos-list', { q: debounced }],
    queryFn: () =>
      listRecursos({
        q: debounced,
        page: 1,
        pageSize: PAGE_SIZE,
        ativo: true,
      }),
    staleTime: 30_000,
  });

  return (
    <section className="space-y-4">
      <header className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Voltar">
          <Link to="/agenda">
            <ArrowLeft aria-hidden="true" />
          </Link>
        </Button>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Stethoscope aria-hidden="true" className="h-6 w-6" />
          Recursos de agenda
        </h1>
      </header>

      <div className="relative max-w-sm">
        <Search
          aria-hidden="true"
          className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          aria-label="Buscar recurso"
          placeholder="Nome do recurso..."
          className="pl-8"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Intervalo (min)</TableHead>
              <TableHead>Ativo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, idx) => (
                <TableRow key={`s-${idx}`}>
                  <TableCell colSpan={4}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : data && data.data.length > 0 ? (
              data.data.map((r) => (
                <TableRow key={r.uuid}>
                  <TableCell className="font-medium">{r.nome}</TableCell>
                  <TableCell>{r.tipo}</TableCell>
                  <TableCell>{r.intervaloMinutos}</TableCell>
                  <TableCell>{r.ativo ? 'Sim' : 'Não'}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum recurso cadastrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
