/**
 * Unit do `MapaLeitosService`.
 *
 * Cobertura:
 *   - cada handler `@OnEvent` chama o gateway com o nome correto e
 *     as rooms certas (setor + tenant).
 *   - `relay` engolindo erro de gateway sem propagar exceção.
 *
 * Não testamos a registração do `EventEmitter2` (responsabilidade do
 * Nest framework). Testamos apenas o handler como função pura.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { LEITO_EVENT_NAMES } from '../events/leito.events';
import type {
  LeitoAlocadoEventPayload,
  LeitoLiberadoEventPayload,
} from '../events/leito.events';
import { MapaLeitosService } from '../mapa-leitos.service';

describe('MapaLeitosService', () => {
  const emit = vi.fn();
  const gateway = { emitToSetorAndTenant: emit } as never;
  let service: MapaLeitosService;

  beforeEach(() => {
    emit.mockReset();
    service = new MapaLeitosService(gateway);
  });

  function basePayload(setorId = '7', tenantId = '1') {
    return {
      tenantId,
      leitoId: '11',
      leitoCodigo: '201A',
      setorId,
      setorNome: 'UTI Geral',
      versao: 4,
      emitidoEm: '2026-04-28T12:00:00.000Z',
    };
  }

  it('handleAlocado → emite leito.alocado nas rooms', () => {
    const payload: LeitoAlocadoEventPayload = {
      ...basePayload(),
      ocupacaoIniciadaEm: '2026-04-28T11:00:00.000Z',
      ocupacaoPrevistaFim: null,
      paciente: {
        uuid: 'p-uuid',
        nome: 'Maria S.',
        idade: 67,
        diasInternado: 0,
        alergias: [],
      },
      atendimento: {
        uuid: 'a-uuid',
        tipo: 'INTERNACAO',
        dataEntrada: '2026-04-28T10:30:00.000Z',
      },
    };
    service.handleAlocado(payload);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      LEITO_EVENT_NAMES.ALOCADO,
      '7',
      '1',
      payload,
    );
  });

  it('handleLiberado → emite leito.liberado nas rooms', () => {
    const payload: LeitoLiberadoEventPayload = {
      ...basePayload(),
      motivo: 'ALTA',
      atendimentoUuid: 'a-uuid',
    };
    service.handleLiberado(payload);
    expect(emit).toHaveBeenCalledWith(
      LEITO_EVENT_NAMES.LIBERADO,
      '7',
      '1',
      payload,
    );
  });

  it('handleHigienizando → emite leito.higienizando', () => {
    service.handleHigienizando({ ...basePayload() });
    expect(emit).toHaveBeenCalledWith(
      LEITO_EVENT_NAMES.HIGIENIZANDO,
      '7',
      '1',
      expect.objectContaining({ leitoId: '11' }),
    );
  });

  it('handleDisponivel → emite leito.disponivel', () => {
    service.handleDisponivel({ ...basePayload() });
    expect(emit).toHaveBeenCalledWith(
      LEITO_EVENT_NAMES.DISPONIVEL,
      '7',
      '1',
      expect.any(Object),
    );
  });

  it('handleManutencao → emite leito.manutencao', () => {
    service.handleManutencao({ ...basePayload(), motivo: 'limpeza terminal' });
    expect(emit).toHaveBeenCalledWith(
      LEITO_EVENT_NAMES.MANUTENCAO,
      '7',
      '1',
      expect.any(Object),
    );
  });

  it('handleBloqueado → emite leito.bloqueado', () => {
    service.handleBloqueado({ ...basePayload(), motivo: 'isolamento' });
    expect(emit).toHaveBeenCalledWith(
      LEITO_EVENT_NAMES.BLOQUEADO,
      '7',
      '1',
      expect.any(Object),
    );
  });

  it('handleReservado → emite leito.reservado', () => {
    service.handleReservado({ ...basePayload(), motivo: 'cirurgia eletiva' });
    expect(emit).toHaveBeenCalledWith(
      LEITO_EVENT_NAMES.RESERVADO,
      '7',
      '1',
      expect.any(Object),
    );
  });

  it('engole erro do gateway sem propagar exception', () => {
    emit.mockImplementation(() => {
      throw new Error('socket boom');
    });
    expect(() =>
      service.handleAlocado({
        ...basePayload(),
        ocupacaoIniciadaEm: '2026-04-28T11:00:00.000Z',
        ocupacaoPrevistaFim: null,
        paciente: {
          uuid: 'p',
          nome: 'X Y',
          idade: 30,
          diasInternado: 0,
          alergias: [],
        },
        atendimento: {
          uuid: 'a',
          tipo: 'INTERNACAO',
          dataEntrada: '2026-04-28T10:30:00.000Z',
        },
      }),
    ).not.toThrow();
  });
});
