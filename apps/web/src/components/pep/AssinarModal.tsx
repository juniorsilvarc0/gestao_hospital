/**
 * AssinarModal — dupla confirmação antes de assinar registro clínico
 * (evolução, prescrição, laudo, documento).
 *
 * Regras (RN-PEP-02 / RN-PEP-03 / RN-PRE-07):
 *  - Três checkboxes obrigatórios para habilitar o botão "ASSINAR".
 *  - Após assinar, o registro vira IMUTÁVEL (controlado por trigger no DB).
 *  - PIN do certificado A1 é placeholder — Fase 13 conecta `lib-cades`
 *    + cadeia ICP-Brasil real. Hoje a chamada de assinatura é simulada
 *    pelo backend.
 *
 * Acessibilidade:
 *  - `role="dialog"`, fechamento por ESC, foco inicial no primeiro
 *    checkbox.
 */
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Lock } from 'lucide-react';
import { Button, Input, Label } from '@/components/ui';
import type { AssinarEvolucaoInput } from '@/types/pep';

interface AssinarModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tipo do recurso (texto exibido). */
  tipoRecurso: 'evolução' | 'prescrição' | 'laudo' | 'documento';
  /** Callback de assinatura. Lança erro → modal mostra mensagem. */
  onSign: (input: AssinarEvolucaoInput) => Promise<void>;
  /** Mensagem de contexto (ex.: "Evolução 28/04 14:30 — Dr. Silva"). */
  contexto?: string;
  /** Indica se PIN é exigido (placeholder; default `false`). */
  requerPin?: boolean;
}

export function AssinarModal({
  open,
  onOpenChange,
  tipoRecurso,
  onSign,
  contexto,
  requerPin = false,
}: AssinarModalProps): JSX.Element | null {
  const [leuConteudo, setLeuConteudo] = useState(false);
  const [confirmaAutoria, setConfirmaAutoria] = useState(false);
  const [cienteImutabilidade, setCienteImutabilidade] = useState(false);
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const firstCheckRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setLeuConteudo(false);
    setConfirmaAutoria(false);
    setCienteImutabilidade(false);
    setPin('');
    setSubmitting(false);
    setErrorMsg(null);
    function handleKey(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !submitting) onOpenChange(false);
    }
    document.addEventListener('keydown', handleKey);
    setTimeout(() => firstCheckRef.current?.focus(), 0);
    return () => {
      document.removeEventListener('keydown', handleKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const allChecked =
    leuConteudo && confirmaAutoria && cienteImutabilidade;
  const pinOk = !requerPin || pin.length >= 4;
  const canSubmit = allChecked && pinOk && !submitting;

  async function handleSubmit(): Promise<void> {
    if (!canSubmit) return;
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await onSign({
        confirmacoes: {
          leuConteudo,
          confirmaAutoria,
          cienteImutabilidade,
        },
        ...(requerPin && pin ? { pin } : {}),
      });
      onOpenChange(false);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Falha ao assinar. Tente novamente.';
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="assinar-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="relative w-full max-w-lg space-y-4 rounded-md border bg-background p-6 shadow-lg">
        <header className="space-y-1">
          <h2
            id="assinar-modal-title"
            className="flex items-center gap-2 text-lg font-semibold"
          >
            <Lock aria-hidden="true" className="h-5 w-5 text-emerald-700" />
            Assinatura digital — {tipoRecurso}
          </h2>
          <p className="text-sm text-muted-foreground">
            {contexto ?? 'Confirme as três declarações abaixo para liberar a assinatura.'}
          </p>
        </header>

        <ul className="space-y-2">
          <li>
            <label className="flex items-start gap-2 rounded-md border p-3 text-sm transition-colors hover:bg-accent/40">
              <input
                ref={firstCheckRef}
                type="checkbox"
                checked={leuConteudo}
                onChange={(e) => setLeuConteudo(e.target.checked)}
                className="mt-1 h-4 w-4"
                aria-describedby="hint-leu"
              />
              <div>
                <p>Confirmo que <strong>li integralmente</strong> o conteúdo do registro.</p>
                <p
                  id="hint-leu"
                  className="text-xs text-muted-foreground"
                >
                  Assinatura digital tem o mesmo valor jurídico de assinatura
                  manuscrita (MP 2.200-2/2001).
                </p>
              </div>
            </label>
          </li>
          <li>
            <label className="flex items-start gap-2 rounded-md border p-3 text-sm transition-colors hover:bg-accent/40">
              <input
                type="checkbox"
                checked={confirmaAutoria}
                onChange={(e) => setConfirmaAutoria(e.target.checked)}
                className="mt-1 h-4 w-4"
              />
              <div>
                <p>
                  Confirmo a <strong>autoria</strong> e a veracidade das
                  informações.
                </p>
              </div>
            </label>
          </li>
          <li>
            <label className="flex items-start gap-2 rounded-md border p-3 text-sm transition-colors hover:bg-accent/40">
              <input
                type="checkbox"
                checked={cienteImutabilidade}
                onChange={(e) => setCienteImutabilidade(e.target.checked)}
                className="mt-1 h-4 w-4"
              />
              <div>
                <p>
                  Concordo que após assinatura o registro é{' '}
                  <strong>IMUTÁVEL</strong>; correções exigem nova versão
                  vinculada à anterior (RN-PEP-03).
                </p>
              </div>
            </label>
          </li>
        </ul>

        {requerPin ? (
          <div className="space-y-1">
            <Label htmlFor="assinar-pin">
              PIN do certificado A1 (placeholder)
            </Label>
            <Input
              id="assinar-pin"
              type="password"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              minLength={4}
              maxLength={32}
            />
            <p className="text-[11px] text-muted-foreground">
              Em produção, o PIN libera o uso do certificado ICP-Brasil
              (Fase 13). Hoje aceitamos qualquer valor com 4+ caracteres.
            </p>
          </div>
        ) : null}

        {errorMsg ? (
          <p
            role="alert"
            className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive"
          >
            <AlertTriangle aria-hidden="true" className="h-4 w-4" />
            {errorMsg}
          </p>
        ) : null}

        <footer className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() => {
              void handleSubmit();
            }}
            aria-busy={submitting}
          >
            {submitting ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <Lock aria-hidden="true" />
            )}
            ASSINAR
          </Button>
        </footer>
      </div>
    </div>
  );
}
