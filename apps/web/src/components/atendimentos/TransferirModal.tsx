/**
 * TransferirModal — transferência interna ou externa de atendimento.
 *
 * Interna: muda setor/leito mantendo o mesmo `atendimento_id`.
 * Externa: gera novo atendimento com `atendimento_origem_id` (RN-ATE-08).
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Bed, Loader2 } from 'lucide-react';
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
  Select,
  Textarea,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { transferirAtendimento } from '@/lib/atendimentos-api';
import { listLeitosArray } from '@/lib/leitos-api';
import { useToast } from '@/components/Toast';
import { LEITO_STATUS_PALETTE } from '@/types/leitos';
import type { Leito } from '@/types/leitos';
import { cn } from '@/lib/utils';

interface TransferirModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  atendimentoUuid: string;
  setoresOptions: { uuid: string; nome: string }[];
  defaultSetorUuid?: string | null;
  onSuccess?: () => void;
}

export function TransferirModal({
  open,
  onOpenChange,
  atendimentoUuid,
  setoresOptions,
  defaultSetorUuid,
  onSuccess,
}: TransferirModalProps): JSX.Element {
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();
  const [externa, setExterna] = useState(false);
  const [setorDestino, setSetorDestino] = useState<string>('');
  const [destinoExterno, setDestinoExterno] = useState('');
  const [motivo, setMotivo] = useState('');
  const [selectedLeito, setSelectedLeito] = useState<Leito | null>(null);

  useEffect(() => {
    if (!open) return;
    setExterna(false);
    setSetorDestino(defaultSetorUuid ?? '');
    setDestinoExterno('');
    setMotivo('');
    setSelectedLeito(null);
  }, [open, defaultSetorUuid]);

  const leitosQuery = useQuery({
    queryKey: ['leitos', { setor: setorDestino, status: 'DISPONIVEL' }],
    queryFn: () =>
      listLeitosArray({
        ...(setorDestino ? { setorUuid: setorDestino } : {}),
        status: 'DISPONIVEL',
      }),
    enabled: open && !externa && Boolean(setorDestino),
    staleTime: 5_000,
  });

  const mutation = useMutation({
    mutationFn: () => {
      if (motivo.trim().length < 3) {
        return Promise.reject(new Error('Motivo obrigatório.'));
      }
      if (externa) {
        if (!destinoExterno.trim()) {
          return Promise.reject(new Error('Destino externo obrigatório.'));
        }
        return transferirAtendimento(atendimentoUuid, {
          externa: true,
          destinoExterno: destinoExterno.trim(),
          motivo: motivo.trim(),
        });
      }
      return transferirAtendimento(atendimentoUuid, {
        ...(setorDestino ? { setorUuid: setorDestino } : {}),
        ...(selectedLeito
          ? { leitoUuid: selectedLeito.uuid, leitoVersao: selectedLeito.versao }
          : {}),
        motivo: motivo.trim(),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['atendimentos'] });
      void queryClient.invalidateQueries({ queryKey: ['leitos'] });
      void queryClient.invalidateQueries({ queryKey: ['mapa-leitos'] });
      showToast({
        variant: 'success',
        title: 'Transferência realizada',
        description: '',
      });
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        showToast({
          variant: 'destructive',
          title: 'Conflito de leito',
          description: 'Outro operador alocou o leito. Tente novamente.',
        });
        void queryClient.invalidateQueries({ queryKey: ['leitos'] });
        setSelectedLeito(null);
        return;
      }
      const msg =
        err instanceof ApiError
          ? err.detail ?? err.message
          : err instanceof Error
            ? err.message
            : 'Falha ao transferir.';
      showToast({ variant: 'destructive', title: 'Erro', description: msg });
    },
  });

  const leitos = useMemo(() => leitosQuery.data ?? [], [leitosQuery.data]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Transferir atendimento</DialogTitle>
          <DialogDescription>
            Interna mantém o mesmo atendimento. Externa gera novo
            (`atendimento_origem_id`).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={externa}
              onChange={(event) => setExterna(event.target.checked)}
            />
            Transferência externa (outro hospital/serviço)
          </label>

          {externa ? (
            <div className="space-y-1">
              <Label htmlFor="destino-externo">Destino externo</Label>
              <Input
                id="destino-externo"
                value={destinoExterno}
                onChange={(event) => setDestinoExterno(event.target.value)}
                placeholder="Hospital São José - UPA Centro"
              />
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <Label htmlFor="setor-destino">Setor destino</Label>
                <Select
                  id="setor-destino"
                  value={setorDestino}
                  onChange={(event) => setSetorDestino(event.target.value)}
                >
                  <option key="__empty__" value="">Selecione...</option>
                  {setoresOptions.map((s) => (
                    <option key={s.uuid} value={s.uuid}>
                      {s.nome}
                    </option>
                  ))}
                </Select>
              </div>
              {setorDestino ? (
                <div className="space-y-1">
                  <Label>Leito (opcional)</Label>
                  <div className="max-h-48 overflow-y-auto rounded-md border p-2">
                    {leitosQuery.isLoading ? (
                      <p className="text-xs text-muted-foreground">
                        Carregando leitos...
                      </p>
                    ) : leitos.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Nenhum leito disponível neste setor.
                      </p>
                    ) : (
                      <ul className="grid grid-cols-2 gap-2">
                        {leitos.map((l) => {
                          const palette = LEITO_STATUS_PALETTE[l.status];
                          const selected = selectedLeito?.uuid === l.uuid;
                          return (
                            <li key={l.uuid}>
                              <button
                                type="button"
                                onClick={() => setSelectedLeito(l)}
                                className={cn(
                                  'flex w-full flex-col rounded-md border p-2 text-left text-xs',
                                  palette.card,
                                  palette.border,
                                  selected &&
                                    'ring-2 ring-offset-1 ring-foreground',
                                )}
                              >
                                <span className="flex items-center gap-1 font-semibold">
                                  <Bed aria-hidden="true" className="h-3 w-3" />
                                  {l.codigo}
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                  v{l.versao}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              ) : null}
            </>
          )}

          <div className="space-y-1">
            <Label htmlFor="motivo-transferencia">Motivo *</Label>
            <Textarea
              id="motivo-transferencia"
              rows={2}
              value={motivo}
              onChange={(event) => setMotivo(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={mutation.isPending || motivo.trim().length < 3}
            aria-busy={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <ArrowRightLeft aria-hidden="true" />
            )}
            Transferir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
