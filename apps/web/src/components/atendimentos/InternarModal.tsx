/**
 * InternarModal — seleção de leito DISPONIVEL no setor para internar.
 *
 * Concorrência (RN-ATE-08 + DB.md §10.5):
 *  - Cada card de leito mostra `versao` atual.
 *  - Ao confirmar, envia `{ leitoUuid, leitoVersao }` ao backend.
 *  - Em 409 (LEITO_CONFLICT), recarrega lista e exibe toast.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bed, Loader2, RefreshCw } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  Textarea,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { internarAtendimento } from '@/lib/atendimentos-api';
import { listLeitosArray } from '@/lib/leitos-api';
import { useToast } from '@/components/Toast';
import { LEITO_STATUS_PALETTE } from '@/types/leitos';
import type { Leito } from '@/types/leitos';
import { cn } from '@/lib/utils';

interface InternarModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  atendimentoUuid: string;
  setorUuid: string | null;
  setoresOptions: { uuid: string; nome: string }[];
  onSuccess?: () => void;
}

export function InternarModal({
  open,
  onOpenChange,
  atendimentoUuid,
  setorUuid,
  setoresOptions,
  onSuccess,
}: InternarModalProps): JSX.Element {
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();
  const [filtroSetor, setFiltroSetor] = useState<string>('');
  const [selectedLeito, setSelectedLeito] = useState<Leito | null>(null);
  const [observacao, setObservacao] = useState('');

  useEffect(() => {
    if (!open) return;
    setFiltroSetor(setorUuid ?? '');
    setSelectedLeito(null);
    setObservacao('');
  }, [open, setorUuid]);

  const leitosQuery = useQuery({
    queryKey: ['leitos', { setor: filtroSetor, status: 'DISPONIVEL' }],
    queryFn: () =>
      listLeitosArray({
        ...(filtroSetor ? { setorUuid: filtroSetor } : {}),
        status: 'DISPONIVEL',
      }),
    enabled: open,
    staleTime: 5_000,
  });

  const internarMutation = useMutation({
    mutationFn: () => {
      if (!selectedLeito) {
        return Promise.reject(new Error('Selecione um leito.'));
      }
      return internarAtendimento(atendimentoUuid, {
        leitoUuid: selectedLeito.uuid,
        leitoVersao: selectedLeito.versao,
        ...(observacao ? { observacao } : {}),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['atendimentos'] });
      void queryClient.invalidateQueries({ queryKey: ['leitos'] });
      void queryClient.invalidateQueries({ queryKey: ['mapa-leitos'] });
      showToast({
        variant: 'success',
        title: 'Paciente internado',
        description: `Leito ${selectedLeito?.codigo ?? ''}.`,
      });
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        showToast({
          variant: 'destructive',
          title: 'Leito mudou de status',
          description:
            'Outro operador alterou o leito antes da sua confirmação. Tente outro.',
        });
        // Recarrega lista.
        void queryClient.invalidateQueries({ queryKey: ['leitos'] });
        setSelectedLeito(null);
        return;
      }
      const msg =
        err instanceof ApiError ? err.detail ?? err.message : 'Falha ao internar.';
      showToast({ variant: 'destructive', title: 'Erro', description: msg });
    },
  });

  const leitosDisponiveis = useMemo(
    () => leitosQuery.data ?? [],
    [leitosQuery.data],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Internar paciente</DialogTitle>
          <DialogDescription>
            Selecione um leito disponível. A operação valida `versao` (otimistic
            lock).
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="filtro-setor-internar">Setor</Label>
            <Select
              id="filtro-setor-internar"
              value={filtroSetor}
              onChange={(event) => setFiltroSetor(event.target.value)}
            >
              <option value="">Todos</option>
              {setoresOptions.map((s) => (
                <option key={s.uuid} value={s.uuid}>
                  {s.nome}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                queryClient.invalidateQueries({ queryKey: ['leitos'] })
              }
            >
              <RefreshCw aria-hidden="true" />
              Recarregar
            </Button>
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto rounded-md border p-2">
          {leitosQuery.isLoading ? (
            <p className="flex items-center gap-2 px-2 py-4 text-sm text-muted-foreground">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              Carregando...
            </p>
          ) : leitosDisponiveis.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum leito disponível.
            </p>
          ) : (
            <ul
              role="listbox"
              aria-label="Leitos disponíveis"
              className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3"
            >
              {leitosDisponiveis.map((l) => {
                const palette = LEITO_STATUS_PALETTE[l.status];
                const selected = selectedLeito?.uuid === l.uuid;
                return (
                  <li key={l.uuid}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => setSelectedLeito(l)}
                      className={cn(
                        'flex w-full flex-col rounded-md border-2 p-2 text-left transition-all',
                        palette.card,
                        palette.border,
                        selected
                          ? 'ring-2 ring-offset-2 ring-foreground'
                          : 'hover:opacity-90',
                      )}
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        <Bed aria-hidden="true" className="h-4 w-4" />
                        {l.codigo}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {l.tipoAcomodacao} · v{l.versao}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="internar-observacao">Observação</Label>
          <Textarea
            id="internar-observacao"
            rows={2}
            value={observacao}
            onChange={(event) => setObservacao(event.target.value)}
          />
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
            disabled={!selectedLeito || internarMutation.isPending}
            aria-busy={internarMutation.isPending}
            onClick={() => internarMutation.mutate()}
          >
            {internarMutation.isPending ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <Bed aria-hidden="true" />
            )}
            Confirmar internação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
