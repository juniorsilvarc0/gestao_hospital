/**
 * ProcedimentoAutocomplete — busca remota em /v1/tabelas-procedimentos.
 *
 * Filtra por `tipo` (MEDICAMENTO/CUIDADO/...) e devolve item selecionado
 * via `onSelect`. UI minimalista (sem combobox lib): input + lista.
 */
import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { buscarProcedimentos } from '@/lib/pep-api';
import type { ProcedimentoCatalogo, TipoItemPrescricao } from '@/types/pep';
import { cn } from '@/lib/utils';

interface ProcedimentoAutocompleteProps {
  /** Filtra por tipo de item de prescrição. */
  tipo?: TipoItemPrescricao;
  initialValue?: string;
  placeholder?: string;
  onSelect: (item: ProcedimentoCatalogo) => void;
  /** Mostrado abaixo (descrição do procedimento atualmente selecionado). */
  selectedLabel?: string | null;
  ariaLabel?: string;
}

export function ProcedimentoAutocomplete({
  tipo,
  initialValue = '',
  placeholder = 'Buscar procedimento (TUSS/CBHPM)...',
  onSelect,
  selectedLabel,
  ariaLabel,
}: ProcedimentoAutocompleteProps): JSX.Element {
  const [query, setQuery] = useState(initialValue);
  const [results, setResults] = useState<ProcedimentoCatalogo[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounced = useDebouncedValue(query, 250);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (debounced.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError(null);
    buscarProcedimentos({ q: debounced.trim(), ...(tipo ? { tipo } : {}), limit: 12 })
      .then((items) => {
        if (cancelled) return;
        setResults(items);
        setOpen(true);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Falha ao buscar procedimentos.');
        setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, tipo]);

  // Fechar ao clicar fora.
  useEffect(() => {
    function handleClick(e: MouseEvent): void {
      if (
        containerRef.current &&
        e.target instanceof Node &&
        !containerRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label={ariaLabel ?? 'Buscar procedimento'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="pl-8"
          autoComplete="off"
        />
      </div>
      {selectedLabel ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Selecionado:{' '}
          <span className="font-medium text-foreground">{selectedLabel}</span>
        </p>
      ) : null}
      {open && (results.length > 0 || loading || error) ? (
        <ul
          role="listbox"
          aria-label="Resultados"
          className={cn(
            'absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md',
          )}
        >
          {loading ? (
            <li className="px-2 py-1 text-xs text-muted-foreground">
              Buscando...
            </li>
          ) : null}
          {error ? (
            <li role="alert" className="px-2 py-1 text-xs text-destructive">
              {error}
            </li>
          ) : null}
          {results.map((item) => (
            <li key={item.uuid}>
              <button
                type="button"
                role="option"
                aria-selected="false"
                onClick={() => {
                  onSelect(item);
                  setQuery('');
                  setOpen(false);
                }}
                className="flex w-full flex-col items-start rounded-sm px-2 py-1 text-left hover:bg-accent"
              >
                <span className="text-sm font-medium">
                  {item.codigo} — {item.descricao}
                </span>
                {item.principioAtivo ? (
                  <span className="text-[11px] text-muted-foreground">
                    Princípio ativo: {item.principioAtivo}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
