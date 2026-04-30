/**
 * Unit do `NotificacaoService` (stub).
 *
 * Verifica:
 *   - retorna sem lançar para SMS / EMAIL / WHATSAPP / PUSH;
 *   - log estruturado emitido com destino mascarado (sem PHI).
 */
import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificacaoService } from '../infrastructure/notificacao.service';

describe('NotificacaoService', () => {
  const service = new NotificacaoService();
  const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

  beforeEach(() => {
    logSpy.mockClear();
  });

  afterEach(() => {
    logSpy.mockReset();
  });

  it('enviarConfirmacao por SMS mascara o destino e loga template', async () => {
    await service.enviarConfirmacao({
      agendamentoId: 42n,
      tenantId: 1n,
      canal: 'SMS',
      destino: '11999999999',
      template: 'agendamento.confirmacao.t-24h',
    });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const meta = logSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(meta.canal).toBe('SMS');
    expect(meta.template).toBe('agendamento.confirmacao.t-24h');
    expect(meta.destinoMasked).toBe('1199****9999');
    // Não vaza o número completo.
    expect(JSON.stringify(meta)).not.toContain('11999999999');
  });

  it('enviarConfirmacao por EMAIL mascara o destino', async () => {
    await service.enviarConfirmacao({
      agendamentoId: 42n,
      tenantId: 1n,
      canal: 'EMAIL',
      destino: 'paciente@example.com',
      template: 'agendamento.confirmacao.t-24h',
    });
    const meta = logSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(meta.destinoMasked).toBe('p***@example.com');
  });

  it('enviarLembrete loga em outro template', async () => {
    await service.enviarLembrete({
      agendamentoId: 42n,
      tenantId: 1n,
      canal: 'WHATSAPP',
      destino: '11988887777',
      template: 'agendamento.lembrete.t-1h',
    });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const msg = logSpy.mock.calls[0][1];
    expect(msg).toContain('lembrete');
  });

  it('promise resolve mesmo com canal exótico (PUSH)', async () => {
    await expect(
      service.enviarConfirmacao({
        agendamentoId: 1n,
        tenantId: 1n,
        canal: 'PUSH',
        destino: 'fcm-token-abc',
        template: 'whatever',
      }),
    ).resolves.toBeUndefined();
  });
});
