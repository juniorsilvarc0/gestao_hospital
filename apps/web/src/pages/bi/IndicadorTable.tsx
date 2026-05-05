/**
 * IndicadorTable — tabela genérica usada nas 3 páginas de indicadores
 * (assistencial / financeiro / operacional).
 *
 * Recebe colunas + linhas e renderiza com `<Table>` (UI primitive). Lida
 * com loading / vazio.
 */
import { Loader2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';

export interface IndicadorColumn<T> {
  key: string;
  label: string;
  render: (row: T) => React.ReactNode;
  className?: string;
}

export interface IndicadorTableProps<T> {
  columns: IndicadorColumn<T>[];
  rows: T[];
  isLoading?: boolean;
  emptyText?: string;
}

export function IndicadorTable<T>({
  columns,
  rows,
  isLoading,
  emptyText = 'Sem dados no período.',
}: IndicadorTableProps<T>): JSX.Element {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c.key} className={c.className}>
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="py-6 text-center text-sm text-muted-foreground"
              >
                <span className="inline-flex items-center gap-2">
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                  Carregando...
                </span>
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="py-6 text-center text-sm text-muted-foreground"
              >
                {emptyText}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row, idx) => (
              <TableRow key={idx}>
                {columns.map((c) => (
                  <TableCell key={c.key} className={c.className}>
                    {c.render(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

IndicadorTable.displayName = 'IndicadorTable';
