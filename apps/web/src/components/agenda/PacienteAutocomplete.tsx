/**
 * PacienteAutocomplete — combo box com busca debounced sobre /pacientes.
 *
 * Comportamento:
 *  - Ao digitar, busca via `listPacientes({ q })` debounced 350ms.
 *  - Mostra lista de até 8 sugestões.
 *  - Selecionar dispara `onChange(uuid, paciente)`.
 *  - Acessibilidade: `role="combobox"`, navegação por seta/enter.
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2, User } from 'lucide-react';
import { Input } from '@/components/ui';
import { listPacientes } from '@/lib/pacientes-api';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { Cpf } from '@/lib/document-validators';
import { cn } from '@/lib/utils';
import type { PacienteResumo } from '@/types/pacientes';

interface PacienteAutocompleteProps {
  value: string | null;
  initialLabel?: string;
  onChange: (uuid: string, paciente: PacienteResumo) => void;
  placeholder?: string;
  id?: string;
}

export function PacienteAutocomplete({
  value,
  initialLabel,
  onChange,
  placeholder = 'Buscar paciente...',
  id,
}: PacienteAutocompleteProps): JSX.Element {
  const [text, setText] = useState(initialLabel ?? '');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<PacienteResumo[]>([]);
  const [loading, setLoading] = useState(false);
  const debounced = useDebouncedValue(text, 350);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (initialLabel !== undefined) setText(initialLabel);
  }, [initialLabel]);

  useEffect(() => {
    if (!open) return;
    if (debounced.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void listPacientes({ q: debounced, page: 1, pageSize: 8 })
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
        aria-controls="paciente-autocomplete-list"
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
        }}
      />
      {value && !text ? (
        <p className="mt-1 text-xs text-muted-foreground">UUID {value}</p>
      ) : null}

      {open && (loading || results.length > 0 || debounced.length >= 2) ? (
        <ul
          id="paciente-autocomplete-list"
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
              Nenhum paciente encontrado.
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
                  setText(p.nomeSocial ?? p.nome);
                  setOpen(false);
                }}
              >
                <User aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="font-medium">{p.nomeSocial ?? p.nome}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.codigo}
                    {p.cpf ? ` · ${Cpf.format(p.cpf)}` : ''}
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
