/**
 * Sheet — painel lateral (slide-over) minimalista, sem Radix.
 *
 * Diferente do Dialog (centralizado), o Sheet abre encostado em uma
 * borda — usado para detalhes/edição contextual que não exigem
 * interrupção total do fluxo.
 *
 * Acessibilidade:
 *  - `role="dialog"`, `aria-modal="true"`.
 *  - Fecha com ESC.
 *  - Backdrop click fecha (configurável).
 *  - Foco inicial no primeiro focável.
 */
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type SheetSide = 'left' | 'right' | 'top' | 'bottom';

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  /** Default: "right". */
  side?: SheetSide;
  /** Default: true. */
  closeOnBackdrop?: boolean;
  /** Largura da sheet quando lateral (Tailwind w-*); default `w-full sm:max-w-md`. */
  widthClassName?: string;
}

const SIDE_CLASSES: Record<SheetSide, string> = {
  right: 'right-0 top-0 h-full',
  left: 'left-0 top-0 h-full',
  top: 'top-0 left-0 w-full',
  bottom: 'bottom-0 left-0 w-full',
};

export function Sheet({
  open,
  onOpenChange,
  children,
  side = 'right',
  closeOnBackdrop = true,
  widthClassName = 'w-full sm:max-w-md',
}: SheetProps): JSX.Element | null {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') onOpenChange(false);
    }
    document.addEventListener('keydown', handleKey);
    const first = contentRef.current?.querySelector<HTMLElement>(
      'input,select,textarea,button,[tabindex]:not([tabindex="-1"])',
    );
    first?.focus();
    return () => {
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  const isHorizontal = side === 'left' || side === 'right';

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 bg-black/50"
      onMouseDown={(event) => {
        if (!closeOnBackdrop) return;
        if (event.target === overlayRef.current) {
          onOpenChange(false);
        }
      }}
    >
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        className={cn(
          'absolute overflow-y-auto bg-background p-6 shadow-xl',
          SIDE_CLASSES[side],
          isHorizontal ? widthClassName : 'max-h-[90vh]',
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function SheetHeader({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className={cn('mb-4 space-y-1 border-b pb-3', className)}>
      {children}
    </div>
  );
}

export function SheetTitle({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <h2 className={cn('text-lg font-semibold tracking-tight', className)}>
      {children}
    </h2>
  );
}

export function SheetDescription({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <p className={cn('text-sm text-muted-foreground', className)}>{children}</p>
  );
}

export function SheetFooter({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className={cn('mt-4 flex justify-end gap-2 border-t pt-3', className)}>
      {children}
    </div>
  );
}
