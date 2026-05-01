/**
 * FinalidadeModal — modal exigindo finalidade de acesso a prontuário (LGPD).
 *
 * Aparece automaticamente sempre que o usuário entra no PEP de um
 * atendimento sem finalidade vigente (ou com TTL expirado — 30 min).
 * Sem fechamento por backdrop / ESC: exigência regulatória — só clicando
 * em "Confirmar" ou voltando para fora do PEP.
 *
 * RN-LGP-01 + RN-PEP-07.
 */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Button, Label, Textarea } from '@/components/ui';
import { useFinalidadeStore } from '@/stores/finalidade-store';
import { FINALIDADES_ACESSO } from '@/types/pep';
import type { FinalidadeAcesso } from '@/types/pep';
import { cn } from '@/lib/utils';

interface FinalidadeModalProps {
  open: boolean;
  atendimentoUuid: string;
  pacienteNome?: string;
  onConfirm?: (finalidade: FinalidadeAcesso) => void;
  onCancel?: () => void;
}

export function FinalidadeModal({
  open,
  atendimentoUuid,
  pacienteNome,
  onConfirm,
  onCancel,
}: FinalidadeModalProps): JSX.Element | null {
  const register = useFinalidadeStore((s) => s.register);
  const [selected, setSelected] = useState<FinalidadeAcesso>('CONSULTA');
  const [detalhe, setDetalhe] = useState('');
  const [touched, setTouched] = useState(false);

  // Reset ao abrir.
  useEffect(() => {
    if (open) {
      setSelected('CONSULTA');
      setDetalhe('');
      setTouched(false);
    }
  }, [open]);

  if (!open) return null;

  const requiresDetalhe = selected === 'OUTRO';
  const detalheValido = !requiresDetalhe || detalhe.trim().length >= 5;
  const canSubmit = detalheValido;

  function handleConfirm(): void {
    setTouched(true);
    if (!canSubmit) return;
    register(atendimentoUuid, selected, requiresDetalhe ? detalhe.trim() : undefined);
    onConfirm?.(selected);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="finalidade-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="relative w-full max-w-lg space-y-4 rounded-md border bg-background p-6 shadow-lg">
        <header className="space-y-1">
          <h2
            id="finalidade-modal-title"
            className="flex items-center gap-2 text-lg font-semibold tracking-tight"
          >
            <ShieldAlert
              aria-hidden="true"
              className="h-5 w-5 text-amber-600"
            />
            Declarar finalidade de acesso
          </h2>
          <p className="text-sm text-muted-foreground">
            {pacienteNome
              ? `Você está acessando o prontuário de ${pacienteNome}.`
              : 'Você está acessando um prontuário.'}{' '}
            Conforme a LGPD (RN-LGP-01), informe o motivo do acesso. O
            registro fica em auditoria.
          </p>
        </header>

        <fieldset className="space-y-2" aria-describedby="finalidade-help">
          <legend className="sr-only">Finalidade do acesso</legend>
          <div className="space-y-1">
            {FINALIDADES_ACESSO.map((opt) => (
              <label
                key={opt.value}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
                  selected === opt.value
                    ? 'border-primary bg-primary/5'
                    : 'hover:bg-accent/40',
                )}
              >
                <input
                  type="radio"
                  name="finalidade"
                  value={opt.value}
                  checked={selected === opt.value}
                  onChange={() => setSelected(opt.value)}
                  className="h-4 w-4"
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
          <p
            id="finalidade-help"
            className="text-[11px] text-muted-foreground"
          >
            Acesso fora do seu setor é registrado como evento separado e
            pode ser revisado pelo DPO.
          </p>
        </fieldset>

        {requiresDetalhe ? (
          <div className="space-y-1">
            <Label htmlFor="finalidade-detalhe">
              Justificativa (mín. 5 caracteres) *
            </Label>
            <Textarea
              id="finalidade-detalhe"
              rows={3}
              value={detalhe}
              onChange={(event) => setDetalhe(event.target.value)}
              aria-invalid={touched && !detalheValido}
            />
            {touched && !detalheValido ? (
              <p role="alert" className="text-xs text-destructive">
                Informe pelo menos 5 caracteres.
              </p>
            ) : null}
          </div>
        ) : null}

        <Footer>
          {onCancel ? (
            <Button type="button" variant="outline" onClick={() => onCancel()}>
              Cancelar
            </Button>
          ) : null}
          <Button type="button" onClick={handleConfirm} disabled={touched && !canSubmit}>
            Confirmar finalidade
          </Button>
        </Footer>
      </div>
    </div>
  );
}

function Footer({ children }: { children: ReactNode }): JSX.Element {
  return <div className="flex justify-end gap-2 pt-2">{children}</div>;
}
