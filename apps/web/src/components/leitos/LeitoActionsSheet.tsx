/**
 * LeitoActionsSheet — Sheet lateral com ações sobre um leito.
 *
 * Disponíveis:
 *  - Liberar (OCUPADO → DISPONIVEL após alta? — geralmente disparado pela alta).
 *  - Higienizar (qualquer → HIGIENIZACAO).
 *  - Manutenção (DISPONIVEL/HIGIENIZACAO → MANUTENCAO).
 *  - Disponibilizar (HIGIENIZACAO/MANUTENCAO → DISPONIVEL).
 *
 * Envia `versao` para otimistic lock.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Sparkles, Wrench, CheckCircle2 } from 'lucide-react';
import {
  Button,
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Textarea,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { updateLeitoStatus } from '@/lib/leitos-api';
import { useToast } from '@/components/Toast';
import { LEITO_STATUS_PALETTE } from '@/types/leitos';
import type { Leito, LeitoStatus } from '@/types/leitos';

interface LeitoActionsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leito: Leito | null;
}

export function LeitoActionsSheet({
  open,
  onOpenChange,
  leito,
}: LeitoActionsSheetProps): JSX.Element | null {
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();
  const [observacao, setObservacao] = useState('');

  useEffect(() => {
    if (!open) setObservacao('');
  }, [open]);

  const mutation = useMutation({
    mutationFn: ({ status }: { status: LeitoStatus }) => {
      if (!leito) {
        return Promise.reject(new Error('Leito ausente.'));
      }
      return updateLeitoStatus(leito.uuid, {
        status,
        versao: leito.versao,
        ...(observacao ? { observacao } : {}),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leitos'] });
      void queryClient.invalidateQueries({ queryKey: ['mapa-leitos'] });
      showToast({
        variant: 'success',
        title: 'Leito atualizado',
        description: '',
      });
      onOpenChange(false);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        showToast({
          variant: 'destructive',
          title: 'Leito mudou de versão',
          description: 'Recarregando — tente novamente.',
        });
        void queryClient.invalidateQueries({ queryKey: ['leitos'] });
        void queryClient.invalidateQueries({ queryKey: ['mapa-leitos'] });
        return;
      }
      const msg =
        err instanceof ApiError
          ? err.detail ?? err.message
          : err instanceof Error
            ? err.message
            : 'Falha ao atualizar status.';
      showToast({ variant: 'destructive', title: 'Erro', description: msg });
    },
  });

  if (!leito) return null;
  const palette = LEITO_STATUS_PALETTE[leito.status];
  const ocup = leito.ocupacao;

  const isOcupado = leito.status === 'OCUPADO';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetHeader>
        <SheetTitle>Leito {leito.codigo}</SheetTitle>
        <SheetDescription>
          Status atual: <strong>{palette.label}</strong> · v{leito.versao}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-3">
        <div className="rounded-md border p-3 text-sm">
          <p>
            <strong>Tipo:</strong> {leito.tipoAcomodacao}
          </p>
          {leito.observacao ? (
            <p>
              <strong>Obs:</strong> {leito.observacao}
            </p>
          ) : null}
          {isOcupado && ocup ? (
            <div className="mt-2 space-y-1">
              <p>
                <strong>Paciente:</strong> {ocup.pacienteNome ?? '—'}
              </p>
              {ocup.prestadorNome ? (
                <p>
                  <strong>Médico:</strong> {ocup.prestadorNome}
                </p>
              ) : null}
              {ocup.alergias?.length ? (
                <p className="text-destructive">
                  ⚠ Alergias: {ocup.alergias.join(', ')}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="space-y-1">
          <label
            htmlFor="leito-observacao"
            className="text-sm font-medium"
          >
            Observação
          </label>
          <Textarea
            id="leito-observacao"
            rows={2}
            value={observacao}
            onChange={(event) => setObservacao(event.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {!isOcupado ? (
            <>
              {leito.status !== 'HIGIENIZACAO' ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ status: 'HIGIENIZACAO' })}
                >
                  <Sparkles aria-hidden="true" />
                  Higienizar
                </Button>
              ) : null}
              {leito.status !== 'DISPONIVEL' ? (
                <Button
                  type="button"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ status: 'DISPONIVEL' })}
                >
                  <CheckCircle2 aria-hidden="true" />
                  Disponibilizar
                </Button>
              ) : null}
              {leito.status !== 'MANUTENCAO' ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ status: 'MANUTENCAO' })}
                >
                  <Wrench aria-hidden="true" />
                  Manutenção
                </Button>
              ) : null}
            </>
          ) : (
            <p className="col-span-full rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              Leito ocupado — a liberação ocorre via alta do atendimento.
            </p>
          )}
        </div>

        {mutation.isPending ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
            Atualizando...
          </p>
        ) : null}
      </div>

      <SheetFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
        >
          Fechar
        </Button>
      </SheetFooter>
    </Sheet>
  );
}
