/**
 * AgendamentoDetalhe — modal de visualização com ações.
 *
 * Ações disponíveis (gated por status):
 *  - Confirmar: AGENDADO → CONFIRMADO.
 *  - Check-in: CONFIRMADO/AGENDADO → COMPARECEU.
 *  - Cancelar: pede motivo (RN-AGE-04 mantém histórico).
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarCheck,
  CheckCircle2,
  Loader2,
  UserCheck,
  XCircle,
} from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import {
  cancelAgendamento,
  checkinAgendamento,
  confirmAgendamento,
} from '@/lib/agenda-api';
import { useToast } from '@/components/Toast';
import type { Agendamento } from '@/types/agenda';

interface AgendamentoDetalheProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agendamento: Agendamento | null;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}

export function AgendamentoDetalhe({
  open,
  onOpenChange,
  agendamento,
}: AgendamentoDetalheProps): JSX.Element | null {
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();
  const [cancelMode, setCancelMode] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
  }

  function handleApiError(err: unknown, fallback: string): void {
    const msg =
      err instanceof ApiError ? err.detail ?? err.message : fallback;
    showToast({ variant: 'destructive', title: 'Erro', description: msg });
  }

  const confirmMutation = useMutation({
    mutationFn: (uuid: string) => confirmAgendamento(uuid),
    onSuccess: () => {
      invalidate();
      showToast({
        variant: 'success',
        title: 'Agendamento confirmado',
        description: '',
      });
      onOpenChange(false);
    },
    onError: (err) => handleApiError(err, 'Falha ao confirmar.'),
  });

  const checkinMutation = useMutation({
    mutationFn: (uuid: string) => checkinAgendamento(uuid),
    onSuccess: () => {
      invalidate();
      showToast({
        variant: 'success',
        title: 'Check-in realizado',
        description: '',
      });
      onOpenChange(false);
    },
    onError: (err) => handleApiError(err, 'Falha no check-in.'),
  });

  const cancelMutation = useMutation({
    mutationFn: ({ uuid, motivo }: { uuid: string; motivo: string }) =>
      cancelAgendamento(uuid, motivo),
    onSuccess: () => {
      invalidate();
      showToast({
        variant: 'success',
        title: 'Agendamento cancelado',
        description: '',
      });
      setCancelMode(false);
      setCancelReason('');
      onOpenChange(false);
    },
    onError: (err) => handleApiError(err, 'Falha ao cancelar.'),
  });

  if (!agendamento) return null;

  const canConfirm = agendamento.status === 'AGENDADO';
  const canCheckin =
    agendamento.status === 'CONFIRMADO' || agendamento.status === 'AGENDADO';
  const canCancel = !['CANCELADO', 'COMPARECEU', 'EM_ATENDIMENTO'].includes(
    agendamento.status,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agendamento</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{agendamento.uuid}</span>
          </DialogDescription>
        </DialogHeader>

        <dl className="space-y-2 text-sm">
          <Row
            label="Paciente"
            value={agendamento.pacienteNome ?? agendamento.pacienteUuid}
          />
          <Row
            label="Recurso"
            value={agendamento.recursoNome ?? agendamento.recursoUuid}
          />
          <Row label="Tipo" value={agendamento.tipo} />
          <Row label="Status" value={<StatusBadge status={agendamento.status} />} />
          <Row label="Início" value={formatDateTime(agendamento.inicio)} />
          <Row label="Fim" value={formatDateTime(agendamento.fim)} />
          {agendamento.encaixe ? (
            <Row label="Encaixe" value="Sim" />
          ) : null}
          {agendamento.observacao ? (
            <Row label="Observação" value={agendamento.observacao} />
          ) : null}
          {agendamento.linkTeleconsulta ? (
            <Row
              label="Teleconsulta"
              value={
                <a
                  href={agendamento.linkTeleconsulta}
                  className="text-primary underline"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Acessar sala
                </a>
              }
            />
          ) : null}
        </dl>

        {cancelMode ? (
          <div className="space-y-2 rounded-md border p-3">
            <Label htmlFor="cancelReason">Motivo do cancelamento</Label>
            <Input
              id="cancelReason"
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="Ex.: paciente solicitou reagendamento"
            />
          </div>
        ) : null}

        <DialogFooter>
          {cancelMode ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCancelMode(false);
                  setCancelReason('');
                }}
              >
                Voltar
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={cancelReason.length < 3 || cancelMutation.isPending}
                aria-busy={cancelMutation.isPending}
                onClick={() =>
                  cancelMutation.mutate({
                    uuid: agendamento.uuid,
                    motivo: cancelReason,
                  })
                }
              >
                {cancelMutation.isPending ? (
                  <Loader2 aria-hidden="true" className="animate-spin" />
                ) : (
                  <XCircle aria-hidden="true" />
                )}
                Confirmar cancelamento
              </Button>
            </>
          ) : (
            <>
              {canCancel ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCancelMode(true)}
                >
                  <XCircle aria-hidden="true" />
                  Cancelar
                </Button>
              ) : null}
              {canConfirm ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => confirmMutation.mutate(agendamento.uuid)}
                  disabled={confirmMutation.isPending}
                >
                  <CheckCircle2 aria-hidden="true" />
                  Confirmar
                </Button>
              ) : null}
              {canCheckin ? (
                <Button
                  type="button"
                  onClick={() => checkinMutation.mutate(agendamento.uuid)}
                  disabled={checkinMutation.isPending}
                >
                  <UserCheck aria-hidden="true" />
                  Check-in
                </Button>
              ) : null}
              {!canCheckin && !canConfirm ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Fechar
                </Button>
              ) : null}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}): JSX.Element {
  return (
    <div className="grid grid-cols-3 gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="col-span-2">{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: string }): JSX.Element {
  const map: Record<string, string> = {
    AGENDADO: 'bg-slate-200 text-slate-900',
    CONFIRMADO: 'bg-blue-200 text-blue-900',
    COMPARECEU: 'bg-emerald-200 text-emerald-900',
    EM_ATENDIMENTO: 'bg-emerald-300 text-emerald-900',
    FALTOU: 'bg-orange-200 text-orange-900',
    CANCELADO: 'bg-red-200 text-red-900 line-through',
    REAGENDADO: 'bg-yellow-200 text-yellow-900',
  };
  const cls = map[status] ?? 'bg-slate-200 text-slate-900';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      <CalendarCheck aria-hidden="true" className="h-3 w-3" />
      {status}
    </span>
  );
}
