/**
 * PrestadorAutocomplete — combo box debounced sobre /v1/prestadores.
 *
 * Comportamento:
 *  - Ao digitar, busca debounced 350ms via `listPrestadores({ q })`.
 *  - Mostra até 8 sugestões.
 *  - Selecionar dispara `onChange(uuid, prestador)`.
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2, Stethoscope } from 'lucide-react';
import { Input } from '@/components/ui';
import { listPrestadores } from '@/lib/atendimentos-api';
import type { PrestadorResumo } from '@/lib/atendimentos-api';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { cn } from '@/lib/utils';

interface PrestadorAutocompleteProps {
  value: string | null;
  initialLabel?: string;
  onChange: (uuid: string, prestador: PrestadorResumo) => void;
  placeholder?: string;
  id?: string;
}

export function PrestadorAutocomplete({
  value,
  initialLabel,
  onChange,
  placeholder = 'Buscar médico/prestador...',
  id,
}: PrestadorAutocompleteProps): JSX.Element {
  const [text, setText] = useState(initialLabel ?? '');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<PrestadorResumo[]>([]);
  const [loading, setLoading] = useState(false);
  const debounced = useDebouncedValue(text, 350);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (initialLabel !== undefined) setText(initialLabel);
  }, [initialLabel]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void listPrestadores({
      ...(debounced.trim().length >= 2 ? { q: debounced } : {}),
      ativo: true,
      page: 1,
      pageSize: 8,
    })
      .then((res) => {
        if (!cancelled) setResults(res.data);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, open]);

  useEffect(() => {
    function handleClick(event: MouseEvent): void {
      if (
        containerRef.current &&
        event.target instanceof Node &&
        !containerRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <Input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
        }}
      />

      {open ? (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-popover p-1 text-sm shadow-md"
        >
          {loading ? (
            <li className="flex items-center gap-2 px-3 py-2 text-muted-foreground">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              Buscando...
            </li>
          ) : results.length === 0 ? (
            <li className="px-3 py-2 text-muted-foreground">
              Nenhum prestador encontrado.
            </li>
          ) : (
            results.map((p) => (
              <li
                key={p.uuid}
                role="option"
                aria-selected={value === p.uuid}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 hover:bg-accent',
                  value === p.uuid && 'bg-accent',
                )}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onChange(p.uuid, p);
                  setText(p.nome);
                  setOpen(false);
                }}
              >
                <Stethoscope
                  aria-hidden="true"
                  className="h-4 w-4 text-muted-foreground"
                />
                <div className="flex flex-col">
                  <span className="font-medium">{p.nome}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.especialidade ?? p.conselho ?? ''}
                    {p.numeroConselho ? ` · ${p.numeroConselho}` : ''}
                  </span>
                </div>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
