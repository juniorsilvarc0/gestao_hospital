/**
 * Unit do `DailyCoService` (stub).
 *
 * Verifica:
 *   - URL gerada tem prefixo esperado e contém o nonce;
 *   - nonce tem 32 caracteres hex (16 bytes);
 *   - `expiraEm` = `fim + 30min` (RN-AGE-05);
 *   - duas chamadas geram nonces diferentes (aleatório).
 */
import { describe, expect, it } from 'vitest';

import { DailyCoService } from '../infrastructure/daily-co.service';

describe('DailyCoService', () => {
  const service = new DailyCoService();
  const inicio = new Date('2026-05-01T10:00:00Z');
  const fim = new Date('2026-05-01T10:30:00Z');

  it('cria sala com URL contendo o nonce e expiraEm = fim + 30min', async () => {
    const sala = await service.criarSala({
      agendamentoUuid: '00000000-0000-4000-8000-000000000001',
      inicio,
      fim,
    });
    expect(sala.url).toMatch(/^https:\/\/daily\.co\/hms-[a-f0-9]{32}$/);
    expect(sala.nonce).toMatch(/^[a-f0-9]{32}$/);
    expect(sala.url.endsWith(sala.nonce)).toBe(true);
    expect(sala.expiraEm.toISOString()).toBe('2026-05-01T11:00:00.000Z');
  });

  it('chamadas concorrentes geram nonces diferentes', async () => {
    const a = await service.criarSala({
      agendamentoUuid: '00000000-0000-4000-8000-000000000002',
      inicio,
      fim,
    });
    const b = await service.criarSala({
      agendamentoUuid: '00000000-0000-4000-8000-000000000003',
      inicio,
      fim,
    });
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.url).not.toBe(b.url);
  });
});
