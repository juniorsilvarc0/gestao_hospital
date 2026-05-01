/**
 * Unit do `TransferirUseCase`. Cobre:
 *   - Interna: requer leito; aloca novo + libera anterior + UPDATE.
 *   - Externa: cria novo atendimento com origem + dá alta no atual.
 */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TransferirUseCase } from '../application/transferir.use-case';
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
  prestador_uuid: 'pp1',
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
  cid_principal: null,
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

describe('TransferirUseCase', () => {
  let repo: {
    findAtendimentoByUuid: ReturnType<typeof vi.fn>;
    setLeitoNoAtendimento: ReturnType<typeof vi.fn>;
    insertAtendimento: ReturnType<typeof vi.fn>;
    darAlta: ReturnType<typeof vi.fn>;
  };
  let allocator: {
    alocar: ReturnType<typeof vi.fn>;
    liberar: ReturnType<typeof vi.fn>;
  };
  let numeroGen: { next: ReturnType<typeof vi.fn> };
  let auditoria: { record: ReturnType<typeof vi.fn> };
  let events: EventEmitter2;
  let useCase: TransferirUseCase;

  beforeEach(() => {
    repo = {
      findAtendimentoByUuid: vi.fn(),
      setLeitoNoAtendimento: vi.fn(),
      insertAtendimento: vi.fn(),
      darAlta: vi.fn(),
    };
    allocator = {
      alocar: vi.fn().mockResolvedValue({ leitoId: 200n, novaVersao: 2 }),
      liberar: vi.fn().mockResolvedValue({ leitoId: 99n, novaVersao: 5 }),
    };
    numeroGen = { next: vi.fn().mockResolvedValue('2026-00000099') };
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
    events = new EventEmitter2();
    useCase = new TransferirUseCase(
      repo as never,
      allocator as never,
      numeroGen as never,
      auditoria as never,
      events,
    );
  });

  it('404 quando atendimento não existe', async () => {
    repo.findAtendimentoByUuid.mockResolvedValueOnce(null);
    await withCtx(async () => {
      await expect(
        useCase.execute(ATEND_INTERNADO.uuid_externo, {
          motivo: 'mudança setor',
          leitoUuid: '00000000-0000-4000-8000-000000000200',
          leitoVersao: 1,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('409 quando atendimento em status terminal', async () => {
    repo.findAtendimentoByUuid.mockResolvedValueOnce({
      ...ATEND_INTERNADO,
      status: 'ALTA',
    });
    await withCtx(async () => {
      await expect(
        useCase.execute(ATEND_INTERNADO.uuid_externo, {
          motivo: 'tarde demais',
          leitoUuid: '00000000-0000-4000-8000-000000000200',
          leitoVersao: 1,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  it('Interna sem leitoUuid → BadRequest', async () => {
    repo.findAtendimentoByUuid.mockResolvedValueOnce({ ...ATEND_INTERNADO });
    await withCtx(async () => {
      await expect(
        useCase.execute(ATEND_INTERNADO.uuid_externo, {
          motivo: 'mudança setor',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('Interna — aloca novo leito + libera anterior', async () => {
    repo.findAtendimentoByUuid
      .mockResolvedValueOnce({ ...ATEND_INTERNADO })
      .mockResolvedValueOnce({ ...ATEND_INTERNADO, leito_id: 200n, leito_uuid: 'l2' });

    await withCtx(() =>
      useCase.execute(ATEND_INTERNADO.uuid_externo, {
        motivo: 'mudança UTI',
        leitoUuid: '00000000-0000-4000-8000-000000000200',
        leitoVersao: 1,
      }),
    );

    expect(allocator.alocar).toHaveBeenCalledOnce();
    expect(allocator.liberar).toHaveBeenCalledWith({ leitoId: 99n });
    expect(repo.setLeitoNoAtendimento).toHaveBeenCalledWith(1n, 200n, 100n);
    expect(auditoria.record).toHaveBeenCalledOnce();
  });

  it('Externa — cria novo atendimento + dá alta no atual', async () => {
    repo.findAtendimentoByUuid
      .mockResolvedValueOnce({ ...ATEND_INTERNADO });
    repo.insertAtendimento.mockResolvedValue({
      id: 999n,
      uuid_externo: 'novo-uuid',
    });
    repo.findAtendimentoByUuid.mockResolvedValue({
      ...ATEND_INTERNADO,
      id: 999n,
      uuid_externo: 'novo-uuid',
      status: 'EM_ESPERA',
      atendimento_origem_id: 1n,
      atendimento_origem_uuid: ATEND_INTERNADO.uuid_externo,
    });

    const result = await withCtx(() =>
      useCase.execute(ATEND_INTERNADO.uuid_externo, {
        externo: true,
        motivo: 'Hospital Especializado',
        destinoExterno: 'Hospital X',
      }),
    );

    expect(repo.insertAtendimento).toHaveBeenCalledOnce();
    const insertArgs = repo.insertAtendimento.mock.calls[0][0];
    expect(insertArgs.atendimentoOrigemId).toBe(1n);
    expect(repo.darAlta).toHaveBeenCalledWith(
      1n,
      'TRANSFERENCIA',
      null,
      expect.stringContaining('Hospital Especializado'),
      100n,
    );
    expect(allocator.liberar).toHaveBeenCalledWith({ leitoId: 99n });
    expect(result.uuid).toBe('novo-uuid');
  });
});
