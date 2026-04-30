/**
 * Dialog (modal) — implementação minimalista sem Radix.
 *
 * Uso:
 *   <Dialog open={open} onOpenChange={setOpen}>
 *     <DialogContent>
 *       <DialogHeader>
 *         <DialogTitle>...</DialogTitle>
 *         <DialogDescription>...</DialogDescription>
 *       </DialogHeader>
 *       ...
 *       <DialogFooter>...</DialogFooter>
 *     </DialogContent>
 *   </Dialog>
 *
 * Acessibilidade:
 *  - `role="dialog"`, `aria-modal="true"`, fecha com ESC.
 *  - Foco inicial vai para o primeiro elemento focável.
 *  - Backdrop click fecha (configurável via `closeOnBackdrop`).
 */
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  /** Default: true */
  closeOnBackdrop?: boolean;
}

export function Dialog({
  open,
  onOpenChange,
  children,
  closeOnBackdrop = true,
}: DialogProps): JSX.Element | null {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') onOpenChange(false);
    }
    document.addEventListener('keydown', handleKey);
    // Auto-focus no primeiro focável.
    const first = contentRef.current?.querySelector<HTMLElement>(
      'input,select,textarea,button,[tabindex]:not([tabindex="-1"])',
    );
    first?.focus();
    return () => {
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
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
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-md border bg-background p-6 shadow-lg"
      >
        {children}
      </div>
    </div>
  );
}

export function DialogContent({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}): JSX.Element {
  return <div className={cn('space-y-4', className)}>{children}</div>;
}

export function DialogHeader({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}): JSX.Element {
  return <div className={cn('space-y-1', className)}>{children}</div>;
}

export function DialogTitle({
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

export function DialogDescription({
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

export function DialogFooter({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className={cn('flex justify-end gap-2 pt-2', className)}>{children}</div>
  );
}
