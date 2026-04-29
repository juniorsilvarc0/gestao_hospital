/**
 * Toast minimalista (zero dependências externas).
 *
 * - Provider único na raiz da árvore (`<ToastProvider>` em `main.tsx`).
 * - Hook `useToast()` retorna `{ show, dismiss }`.
 * - Acessível: cada toast tem `role="status"` (info/success) ou
 *   `role="alert"` (destructive) com `aria-live` apropriado.
 *
 * Por que não `sonner`/`react-hot-toast`?  Mais uma lib pequena que precisa
 * ser auditada, lockfile maior, e a Trilha D não pediu. Quando shadcn/ui
 * Sonner for adicionado ao `ui-kit` (Fase 12), troca-se este por um shim.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ToastVariant = 'info' | 'success' | 'destructive';

export interface ToastInput {
  title?: string;
  description: string;
  variant?: ToastVariant;
  /** ms (padrão 5000). Use `0` para persistente. */
  durationMs?: number;
}

interface ToastInstance extends Required<Omit<ToastInput, 'durationMs'>> {
  id: string;
  durationMs: number;
}

interface ToastContextValue {
  show: (input: ToastInput) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<ToastInstance[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (input: ToastInput): string => {
      const id =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const instance: ToastInstance = {
        id,
        title: input.title ?? '',
        description: input.description,
        variant: input.variant ?? 'info',
        durationMs: input.durationMs ?? 5000,
      };
      setToasts((current) => [...current, instance]);
      if (instance.durationMs > 0) {
        const timer = setTimeout(() => dismiss(id), instance.durationMs);
        timersRef.current.set(id, timer);
      }
      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-label="Notificações"
        className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:right-4 sm:left-auto sm:top-4"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.variant === 'destructive' ? 'alert' : 'status'}
            aria-live={toast.variant === 'destructive' ? 'assertive' : 'polite'}
            className={cn(
              'pointer-events-auto w-full max-w-sm rounded-md border p-4 shadow-lg transition-all',
              toast.variant === 'destructive' &&
                'border-destructive/40 bg-destructive text-destructive-foreground',
              toast.variant === 'success' &&
                'border-emerald-500/40 bg-emerald-50 text-emerald-900',
              toast.variant === 'info' && 'border-border bg-card text-foreground',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                {toast.title ? (
                  <p className="text-sm font-semibold">{toast.title}</p>
                ) : null}
                <p className="text-sm">{toast.description}</p>
              </div>
              <button
                type="button"
                aria-label="Fechar notificação"
                className="text-xs font-medium opacity-70 hover:opacity-100"
                onClick={() => dismiss(toast.id)}
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast precisa estar dentro de <ToastProvider>.');
  }
  return ctx;
}
