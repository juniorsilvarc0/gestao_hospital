/**
 * AgendaPage — calendário FullCalendar para um recurso (médico/sala/equipamento).
 *
 * - Header: seletor de recurso + visões (dia/semana/mês) + botão "Novo".
 *           Botão "Encaixe" disponível para perfis RECEPCAO/ADMIN (RN-AGE-06).
 * - Click em slot vazio → abre <AgendamentoForm> pré-preenchido.
 * - Click em evento → abre <AgendamentoDetalhe>.
 * - Drag-and-drop (eventDrop / eventResize) → PATCH /v1/agendamentos/:uuid.
 *
 * O escopo da consulta de eventos depende do recurso selecionado e da
 * janela visível do calendário (datesSet → atualiza estado).
 */
import { useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type {
  EventClickArg,
  EventDropArg,
  DateSelectArg,
  DatesSetArg,
} from '@fullcalendar/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Calendar as CalendarIcon, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import {
  listAgendamentos,
  updateAgendamento,
} from '@/lib/agenda-api';
import { useToast } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { RecursoSelect } from '@/components/agenda/RecursoSelect';
import { AgendamentoForm } from '@/components/agenda/AgendamentoForm';
import { AgendamentoDetalhe } from '@/components/agenda/AgendamentoDetalhe';
import type { Agendamento, AgendamentoStatus } from '@/types/agenda';

const STATUS_COLOR: Record<AgendamentoStatus, { bg: string; border: string }> = {
  AGENDADO: { bg: '#cbd5e1', border: '#94a3b8' },
  CONFIRMADO: { bg: '#bfdbfe', border: '#3b82f6' },
  COMPARECEU: { bg: '#bbf7d0', border: '#10b981' },
  EM_ATENDIMENTO: { bg: '#86efac', border: '#16a34a' },
  FALTOU: { bg: '#fed7aa', border: '#f97316' },
  CANCELADO: { bg: '#fecaca', border: '#dc2626' },
  REAGENDADO: { bg: '#fde68a', border: '#ca8a04' },
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function AgendaPage(): JSX.Element {
  const calendarRef = useRef<FullCalendar | null>(null);
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();
  const user = useAuthStore((s) => s.user);
  const canEncaixe =
    user?.perfis?.some((p) => ['ADMIN', 'RECEPCAO'].includes(p.toUpperCase())) ?? false;

  const [recursoUuid, setRecursoUuid] = useState<string | null>(null);
  const [range, setRange] = useState<{ start: Date; end: Date }>({
    start: startOfDay(new Date()),
    end: addDays(startOfDay(new Date()), 7),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [createDefaults, setCreateDefaults] = useState<{
    inicio?: string;
    fim?: string;
    encaixe?: boolean;
  }>({});

  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedAgendamento, setSelectedAgendamento] =
    useState<Agendamento | null>(null);

  const eventsQuery = useQuery({
    queryKey: [
      'agendamentos',
      {
        recursoUuid,
        inicio: range.start.toISOString(),
        fim: range.end.toISOString(),
      },
    ],
    queryFn: () =>
      listAgendamentos({
        ...(recursoUuid !== null ? { recursoUuid } : {}),
        inicio: range.start.toISOString(),
        fim: range.end.toISOString(),
      }),
    enabled: Boolean(recursoUuid),
    staleTime: 10_000,
  });

  const updateMutation = useMutation({
    mutationFn: ({
      uuid,
      inicio,
      fim,
    }: {
      uuid: string;
      inicio: string;
      fim: string;
    }) => updateAgendamento(uuid, { inicio, fim }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
      showToast({
        variant: 'success',
        title: 'Agendamento movido',
        description: '',
      });
    },
    onError: (err) => {
      const msg =
        err instanceof ApiError ? err.detail ?? err.message : 'Falha ao mover.';
      showToast({ variant: 'destructive', title: 'Erro', description: msg });
      void queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
    },
  });

  const events = useMemo(
    () =>
      (eventsQuery.data ?? []).map((a) => {
        const c = STATUS_COLOR[a.status];
        return {
          id: a.uuid,
          title: a.pacienteNome ?? 'Paciente',
          start: a.inicio,
          end: a.fim,
          backgroundColor: c.bg,
          borderColor: c.border,
          textColor: '#0f172a',
          editable:
            !['CANCELADO', 'FALTOU', 'COMPARECEU', 'EM_ATENDIMENTO'].includes(
              a.status,
            ),
          classNames: a.status === 'CANCELADO' ? ['line-through'] : [],
          extendedProps: { agendamento: a },
        };
      }),
    [eventsQuery.data],
  );

  function handleDateSelect(arg: DateSelectArg): void {
    if (!recursoUuid) {
      showToast({
        variant: 'info',
        title: 'Selecione um recurso',
        description: 'Escolha um médico/sala antes de agendar.',
      });
      return;
    }
    setCreateDefaults({
      inicio: arg.startStr,
      fim: arg.endStr,
      encaixe: false,
    });
    setCreateOpen(true);
  }

  function handleEventClick(arg: EventClickArg): void {
    const a = arg.event.extendedProps.agendamento as Agendamento | undefined;
    if (!a) return;
    setSelectedAgendamento(a);
    setDetailOpen(true);
  }

  function handleEventDrop(arg: EventDropArg): void {
    const a = arg.event.extendedProps.agendamento as Agendamento | undefined;
    if (!a || !arg.event.start || !arg.event.end) {
      arg.revert();
      return;
    }
    updateMutation.mutate(
      {
        uuid: a.uuid,
        inicio: arg.event.start.toISOString(),
        fim: arg.event.end.toISOString(),
      },
      {
        onError: () => arg.revert(),
      },
    );
  }

  function handleDatesSet(arg: DatesSetArg): void {
    setRange({ start: arg.start, end: arg.end });
  }

  function openEncaixe(): void {
    setCreateDefaults({ encaixe: true });
    setCreateOpen(true);
  }

  return (
    <section className="space-y-4" aria-label="Agenda">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <CalendarIcon aria-hidden="true" className="h-6 w-6" />
            Agenda
          </h1>
          <p className="text-sm text-muted-foreground">
            Selecione um recurso e visualize/agende.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="sm:w-72">
            <RecursoSelect
              value={recursoUuid}
              onChange={(uuid) => setRecursoUuid(uuid)}
            />
          </div>
          <Button
            type="button"
            onClick={() => {
              setCreateDefaults({});
              setCreateOpen(true);
            }}
            disabled={!recursoUuid}
          >
            <CalendarPlus aria-hidden="true" />
            Novo
          </Button>
          {canEncaixe ? (
            <Button
              type="button"
              variant="outline"
              onClick={openEncaixe}
              disabled={!recursoUuid}
            >
              <Sparkles aria-hidden="true" />
              Encaixe
            </Button>
          ) : null}
        </div>
      </header>

      <div className="rounded-md border bg-background p-2">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          locale="pt-br"
          height="auto"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          buttonText={{
            today: 'Hoje',
            month: 'Mês',
            week: 'Semana',
            day: 'Dia',
          }}
          slotMinTime="06:00:00"
          slotMaxTime="22:00:00"
          weekends
          selectable
          editable
          dayMaxEvents
          nowIndicator
          select={handleDateSelect}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          datesSet={handleDatesSet}
          events={events}
        />
      </div>

      <AgendamentoForm
        open={createOpen}
        onOpenChange={setCreateOpen}
        {...(recursoUuid !== null ? { defaultRecursoUuid: recursoUuid } : {})}
        {...(createDefaults.inicio !== undefined ? { defaultInicio: createDefaults.inicio } : {})}
        {...(createDefaults.fim !== undefined ? { defaultFim: createDefaults.fim } : {})}
        defaultEncaixe={createDefaults.encaixe ?? false}
        canEncaixe={canEncaixe}
      />

      <AgendamentoDetalhe
        open={detailOpen}
        onOpenChange={setDetailOpen}
        agendamento={selectedAgendamento}
      />
    </section>
  );
}
