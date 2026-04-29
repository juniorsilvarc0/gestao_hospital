import { describe, expect, it } from 'vitest';

/**
 * Smoke test mínimo para garantir que o pipeline de testes está funcionando.
 * Casos reais entram nas Fases 2+ por bounded context.
 */
describe('smoke', () => {
  it('runtime básico funciona', () => {
    expect(1 + 1).toBe(2);
  });

  it('ambiente é node, não jsdom (api é backend)', () => {
    expect(typeof globalThis.process).toBe('object');
  });

  it('pode importar @nestjs/common', async () => {
    const nest = await import('@nestjs/common');
    expect(typeof nest.Module).toBe('function');
  });
});
