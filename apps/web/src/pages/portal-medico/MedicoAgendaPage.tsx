/**
 * MedicoAgendaPage — agenda do médico (Fase 11 R-C).
 *
 * Lista de agendamentos no intervalo escolhido (default: hoje + 7 dias).
 * Mostra link de teleconsulta inline quando aplicável.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Loader2, Video } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { getMedicoAgenda } from '@/lib/portal-medico-api';
import type { AgendaItemResponse } from '@/types/portal-medico';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function plusDaysISO(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'long',
  });
}

function groupByDate(
  items: AgendaItemResponse[],
): Map<string, AgendaItemResponse[]> {
  const map = new Map<string, AgendaItemResponse[]>();
  for (const it of items) {
    const key = it.inicio.slice(0, 10);
    const arr = map.get(key) ?? [];
    arr.push(it);
    map.set(key, arr);
  }
  return map;
}

export function MedicoAgendaPage(): JSX.Element {
  const [dataInicio, setDataInicio] = useState(todayISO());
  const [dataFim, setDataFim] = useState(plusDaysISO(todayISO(), 7));

  const agendaQuery = useQuery({
    queryKey: ['portal-medico', 'agenda', dataInicio, dataFim],
    queryFn: () =>
      getMedicoAgenda({
        dataInicio: `${dataInicio}T00:00:00.000Z`,
        dataFim: `${dataFim}T23:59:59.999Z`,
      }),
    staleTime: 30_000,
  });

  const grupos = useMemo(() => {
    if (!agendaQuery.data) return [];
    const sorted = [...agendaQuery.data.data].sort((a, b) =>
      a.inicio.localeCompare(b.inicio),
    );
    return [...groupByDate(sorted).entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    );
  }, [agendaQuery.data]);

  return (
    <section className="space-y-4" aria-label="Agenda do médico">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Calendar aria-hidden="true" className="h-6 w-6" />
          Agenda
        </h1>
        <p className="text-sm text-muted-foreground">
          Seus compromissos clínicos no período selecionado.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Período</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid grid-cols-1 gap-3 sm:grid-cols-3"
            onSubmit={(e) => e.preventDefault()}
          >
            <div className="space-y-1">
              <Label htmlFor="agenda-dini">Início</Label>
              <Input
                id="agenda-dini"
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="agenda-dfim">Fim</Label>
              <Input
                id="agenda-dfim"
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
              />
            </div>
            <div className="space-y-1 self-end">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setDataInicio(todayISO());
                  setDataFim(plusDaysISO(todayISO(), 7));
                }}
              >
                Próximos 7 dias
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {agendaQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          Carregando agenda...
        </div>
      ) : agendaQuery.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {agendaQuery.error instanceof ApiError
            ? agendaQuery.error.detail ?? agendaQuery.error.message
            : 'Falha ao carregar agenda.'}
        </p>
      ) : grupos.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          Sem compromissos no período.
        </p>
      ) : (
        <ol className="space-y-4" data-testid="medico-agenda-grupos">
          {grupos.map(([dia, itens]) => (
            <li key={dia} className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {formatDate(`${dia}T00:00:00`)}
              </h2>
              <ul className="space-y-2">
                {itens.map((it) => (
                  <AgendaItemRow key={it.uuid} item={it} />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

MedicoAgendaPage.displayName = 'MedicoAgendaPage';

function AgendaItemRow({ item }: { item: AgendaItemResponse }): JSX.Element {
  return (
    <li
      className="flex flex-col gap-2 rounded-md border bg-card p-3 sm:flex-row sm:items-center"
      data-testid={`medico-agenda-item-${item.uuid}`}
    >
      <div className="min-w-[140px] text-sm">
        <p className="font-medium">{formatDateTime(item.inicio)}</p>
        <p className="text-xs text-muted-foreground">{item.tipo}</p>
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium">{item.pacienteNome}</p>
        {item.observacao ? (
          <p className="text-xs text-muted-foreground">{item.observacao}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] font-medium">
          {item.status}
        </span>
        {item.encaixe ? (
          <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900">
            encaixe
          </span>
        ) : null}
        {item.linkTeleconsulta ? (
          <a
            href={item.linkTeleconsulta}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-primary bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20"
          >
            <Video aria-hidden="true" className="h-3 w-3" />
            Entrar
          </a>
        ) : null}
      </div>
    </li>
  );
}
