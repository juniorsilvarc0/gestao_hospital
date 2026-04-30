import { useEffect, useState } from 'react';

/**
 * Retorna `value` debounced. Útil em buscas com servidor para evitar
 * disparar uma request a cada keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
}
