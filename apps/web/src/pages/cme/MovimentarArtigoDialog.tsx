/**
 * MovimentarArtigoDialog — Dialog para mover um artigo entre etapas (RN-CME-02).
 *
 * Apresenta as transições válidas para a `etapaAtual` (definidas em
 * `TRANSICOES_VALIDAS`). O backend é a autoridade — o frontend faz uma
 * pré-filtragem para evitar UX inconsistente.
 */
import { useState } from 'react';
import { Loader2, MoveRight } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
} from '@/components/ui';
import {
  ETAPA_CME_BADGE,
  ETAPA_CME_LABEL,
  TRANSICOES_VALIDAS,
  type EtapaCme,
  type MovimentarArtigoInput,
} from '@/types/cme';
import { cn } from '@/lib/utils';

interface MovimentarArtigoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  etapaAtual: EtapaCme;
  pending: boolean;
  onSubmit: (input: MovimentarArtigoInput) => void;
}

export function MovimentarArtigoDialog({
  open,
  onOpenChange,
  etapaAtual,
  pending,
  onSubmit,
}: MovimentarArtigoDialogProps): JSX.Element {
  const [destino, setDestino] = useState<EtapaCme | ''>('');
  const [observacao, setObservacao] = useState('');

  const validas = TRANSICOES_VALIDAS[etapaAtual];

  const valid = destino !== '';

  function handleSubmit(): void {
    if (destino === '') return;
    onSubmit({
      etapaDestino: destino,
      ...(observacao ? { observacao: observacao.trim() } : {}),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Movimentar artigo</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p className="rounded-md bg-blue-50 p-2 text-xs text-blue-900">
            RN-CME-02: artigo só sai para uso após confirmar etapa GUARDA.
          </p>

          <div className="space-y-2">
            <Label>Etapa atual</Label>
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
                ETAPA_CME_BADGE[etapaAtual],
              )}
            >
              {ETAPA_CME_LABEL[etapaAtual]}
            </span>
          </div>

          <div className="space-y-2">
            <Label>Etapa destino *</Label>
            {validas.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Sem transições válidas a partir de{' '}
                <strong>{ETAPA_CME_LABEL[etapaAtual]}</strong>.
              </p>
            ) : (
              <div
                role="radiogroup"
                aria-label="Etapas de destino"
                className="flex flex-wrap gap-2"
              >
                {validas.map((e) => {
                  const active = destino === e;
                  return (
                    <button
                      key={e}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setDestino(e)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-all',
                        ETAPA_CME_BADGE[e],
                        active
                          ? 'ring-2 ring-offset-1 ring-foreground'
                          : 'opacity-70',
                      )}
                      data-testid={`mov-destino-${e}`}
                    >
                      <MoveRight aria-hidden="true" className="h-3 w-3" />
                      {ETAPA_CME_LABEL[e]}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="mov-obs">Observação</Label>
            <Textarea
              id="mov-obs"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Voltar
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!valid || pending || validas.length === 0}
          >
            {pending ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <MoveRight aria-hidden="true" />
            )}
            Movimentar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

MovimentarArtigoDialog.displayName = 'MovimentarArtigoDialog';
