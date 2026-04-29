import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * `cn` — helper canônico do shadcn/ui para combinar classes Tailwind sem conflito.
 *  Use sempre que classes condicionais ou variantes envolverem utilitários do mesmo grupo.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
