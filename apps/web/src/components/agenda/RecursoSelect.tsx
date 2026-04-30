/**
 * RecursoSelect — autocomplete para `agendas_recursos`.
 *
 * Inicialmente carrega lista (page 1) e filtra client-side conforme o
 * usuário digita. Para grandes volumes substituir pela busca server-side.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Stethoscope } from 'lucide-react';
import { Input } from '@/components/ui';
import { listRecursos } from '@/lib/agenda-api';
import { cn } from '@/lib/utils';
import type { AgendaRecurso, TipoRecursoAgenda } from '@/types/agenda';

interface RecursoSelectProps {
  value: string | null;
  onChange: (uuid: string, recurso: AgendaRecurso) => void;
  tipo?: TipoRecursoAgenda;
  id?: string;
}

const TIPO_LABEL: Record<TipoRecursoAgenda, string> = {
  MEDICO: 'Médico',
  SALA: 'Sala',
  EQUIPAMENTO: 'Equipamento',
  CONSULTORIO: 'Consultório',
};

export function RecursoSelect({
  value,
  onChange,
  tipo,
  id,
}: RecursoSelectProps): JSX.Element {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['recursos', { tipo }],
    queryFn: () => listRecursos({ ativo: true, pageSize: 100, tipo }),
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    const all = data?.data ?? [];
    if (!text.trim()) return all;
    const q = text.toLowerCase();
    return all.filter((r) => r.nome.toLowerCase().includes(q));
  }, [data, text]);

  const selected = useMemo(
    () => data?.data.find((r) => r.uuid === value) ?? null,
    [data, value],
  );

  useEffect(() => {
    if (selected && !text) setText(selected.nome);
  }, [selected, text]);

  return (
    <div className="relative">
      <Input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        autoComplete="off"
        placeholder="Selecione um recurso..."
        value={text}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
        }}
      />
      {open ? (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-popover p-1 text-sm shadow-md"
        >
          {isLoading ? (
            <li className="flex items-center gap-2 px-3 py-2 text-muted-foreground">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              Carregando...
            </li>
          ) : filtered.length === 0 ? (
            <li className="px-3 py-2 text-muted-foreground">
              Nenhum recurso encontrado.
            </li>
          ) : (
            filtered.map((r) => (
              <li
                key={r.uuid}
                role="option"
                aria-selected={value === r.uuid}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 hover:bg-accent',
                  value === r.uuid && 'bg-accent',
                )}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onChange(r.uuid, r);
                  setText(r.nome);
                  setOpen(false);
                }}
              >
                <Stethoscope
                  aria-hidden="true"
                  className="h-4 w-4 text-muted-foreground"
                />
                <div className="flex flex-col">
                  <span className="font-medium">{r.nome}</span>
                  <span className="text-xs text-muted-foreground">
                    {TIPO_LABEL[r.tipo]} · {r.intervaloMinutos}min
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
