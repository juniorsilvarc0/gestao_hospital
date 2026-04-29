import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Skeleton — placeholder com shimmer (compat shadcn/ui).
 * Usado em loading states para evitar layout shift.
 */
const Skeleton = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('animate-pulse rounded-md bg-muted', className)}
      aria-hidden="true"
      {...props}
    />
  ),
);
Skeleton.displayName = 'Skeleton';

export { Skeleton };
