/**
 * Unit do `AltaUseCase`. Cobre:
 *   - 422 em ÓBITO sem cidPrincipal.
 *   - 409 em estado terminal.
 *   - Caminho feliz: dá alta + libera leito + audita.
 */
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AltaUseCase } from '../application/alta.use-case';
import { RequestContextStorage } from '../../../common/context/request-context';

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  return Promise.resolve(
    RequestContextStorage.run(
      {
        tenantId: 1n,
        userId: 100n,
        correlationId: '11111111-1111-4111-8111-111111111111',
        tx: {} as never,
      },
      fn,
    ),
  );
}

const ATEND_INTERNADO = {
  id: 1n,
  uuid_externo: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  numero_atendimento: '2026-1',
  paciente_id: 10n,
  paciente_uuid: 'b1',
  paciente_nome: 'Maria',
  prestador_id: 20n,
  prestador_uuid: 'p1',
  setor_id: 30n,
  setor_uuid: 's1',
  unidade_faturamento_id: 40n,
  unidade_faturamento_uuid: 'u1',
  unidade_atendimento_id: 50n,
  unidade_atendimento_uuid: 'u2',
  leito_id: 99n,
  leito_uuid: 'l1',
  tipo: 'INTERNACAO',
  tipo_cobranca: 'PARTICULAR',
  paciente_convenio_id: null,
  convenio_id: null,
  convenio_uuid: null,
  plano_id: null,
  plano_uuid: null,
  numero_carteirinha: null,
  numero_guia_operadora: null,
  senha_autorizacao: null,
  classificacao_risco: null,
  classificacao_risco_em: null,
  classificacao_risco_por: null,
  cid_principal: 'I10',
  cids_secundarios: null,
  motivo_atendimento: null,
  tipo_alta: null,
  status: 'INTERNADO',
  data_hora_entrada: new Date('2026-04-25T10:00:00Z'),
  data_hora_saida: null,
  agendamento_id: null,
  agendamento_uuid: null,
  atendimento_origem_id: null,
  atendimento_origem_uuid: null,
  conta_id: 70n,
  conta_uuid: 'c1',
  observacao: null,
  created_at: new Date('2026-04-25T10:00:00Z'),
  updated_at: null,
  versao: 3,
} as const;

describe('AltaUseCase', () => {
  let repo: {
    findAtendimentoByUuid: ReturnType<typeof vi.fn>;
    darAlta: ReturnType<typeof vi.fn>;
    setContaEmElaboracao: ReturnType<typeof vi.fn>;
  };
  let allocator: { liberar: ReturnType<typeof vi.fn> };
  let auditoria: { record: ReturnType<typeof vi.fn> };
  let events: EventEmitter2;
  let useCase: AltaUseCase;

  beforeEach(() => {
    repo = {
      findAtendimentoByUuid: vi.fn(),
      darAlta: vi.fn(),
      setContaEmElaboracao: vi.fn(),
    };
    allocator = {
      liberar: vi.fn().mockResolvedValue({ leitoId: 99n, novaVersao: 5 }),
    };
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
    events = new EventEmitter2();
    useCase = new AltaUseCase(
      repo as never,
      allocator as never,
      auditoria as never,
      events,
    );
  });

  it('404 quando atendimento não existe', async () => {
    repo.findAtendimentoByUuid
      .mockResolvedValueOnce(null);
    await withCtx(async () => {
      await expect(
        useCase.execute(ATEND_INTERNADO.uuid_externo, {
          tipoAlta: 'ALTA_MEDICA',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('409 quando já em ALTA', async () => {
    repo.findAtendimentoByUuid.mockResolvedValueOnce({
      ...ATEND_INTERNADO,
      status: 'ALTA',
    });
    await withCtx(async () => {
      await expect(
        useCase.execute(ATEND_INTERNADO.uuid_externo, {
          tipoAlta: 'ALTA_MEDICA',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  it('422 em ÓBITO sem cidPrincipal', async () => {
    repo.findAtendimentoByUuid.mockResolvedValueOnce({
      ...ATEND_INTERNADO,
      cid_principal: null,
    });
    await withCtx(async () => {
      await expect(
        useCase.execute(ATEND_INTERNADO.uuid_externo, {
          tipoAlta: 'OBITO',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  it('caminho feliz — libera leito e move conta para EM_ELABORACAO', async () => {
    repo.findAtendimentoByUuid
      .mockResolvedValueOnce({ ...ATEND_INTERNADO })
      .mockResolvedValueOnce({ ...ATEND_INTERNADO, status: 'ALTA' });

    const emitted: string[] = [];
    events.on('leito.liberado', () => emitted.push('leito.liberado'));
    events.on('atendimento.alta', () => emitted.push('atendimento.alta'));

    const result = await withCtx(() =>
      useCase.execute(ATEND_INTERNADO.uuid_externo, {
        tipoAlta: 'ALTA_MEDICA',
        motivo: 'Paciente estável',
      }),
    );
    expect(result.status).toBe('ALTA');
    expect(repo.darAlta).toHaveBeenCalledWith(
      1n,
      'ALTA_MEDICA',
      null,
      'Paciente estável',
      100n,
    );
    expect(allocator.liberar).toHaveBeenCalledWith({ leitoId: 99n });
    expect(repo.setContaEmElaboracao).toHaveBeenCalledWith(70n);
    expect(emitted).toContain('leito.liberado');
    expect(emitted).toContain('atendimento.alta');
  });

  it('alta sem leito alocado não chama allocator', async () => {
    repo.findAtendimentoByUuid
      .mockResolvedValueOnce({ ...ATEND_INTERNADO, leito_id: null })
      .mockResolvedValueOnce({ ...ATEND_INTERNADO, leito_id: null, status: 'ALTA' });
    await withCtx(() =>
      useCase.execute(ATEND_INTERNADO.uuid_externo, { tipoAlta: 'ALTA_MEDICA' }),
    );
    expect(allocator.liberar).not.toHaveBeenCalled();
  });
});
