/**
 * Unit do `RegistrarTriagemUseCase`.
 *
 * Cobre:
 *   - 422 em sinais vitais fora da faixa fisiológica.
 *   - Override aceito quando `confirmadoPeloProfissional = true`.
 *   - 409 em estado terminal.
 *   - Caminho feliz: insert + UPDATE classificacao + audit.
 */
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RegistrarTriagemUseCase } from '../application/registrar-triagem.use-case';
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

const ATEND_BASE = {
  id: 1n,
  uuid_externo: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  numero_atendimento: '2026-1',
  paciente_id: 10n,
  paciente_uuid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  paciente_nome: 'João',
  prestador_id: 20n,
  prestador_uuid: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  setor_id: 30n,
  setor_uuid: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  unidade_faturamento_id: 40n,
  unidade_faturamento_uuid: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  unidade_atendimento_id: 50n,
  unidade_atendimento_uuid: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  leito_id: null,
  leito_uuid: null,
  tipo: 'PRONTO_ATENDIMENTO',
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
  status: 'EM_ESPERA',
  data_hora_entrada: new Date('2026-04-28T10:00:00Z'),
  data_hora_saida: null,
  agendamento_id: null,
  agendamento_uuid: null,
  atendimento_origem_id: null,
  atendimento_origem_uuid: null,
  conta_id: null,
  conta_uuid: null,
  observacao: null,
  created_at: new Date('2026-04-28T10:00:00Z'),
  updated_at: null,
  versao: 1,
} as const;

const TRIAGEM_ROW = {
  id: 1n,
  uuid_externo: '11111111-2222-4333-8444-555555555555',
  atendimento_id: 1n,
  atendimento_uuid: ATEND_BASE.uuid_externo,
  classificacao: 'AMARELO',
  protocolo: 'MANCHESTER',
  queixa_principal: 'dor torácica',
  pa_sistolica: 120,
  pa_diastolica: 80,
  fc: 80,
  fr: 16,
  temperatura: '36.5',
  sat_o2: 98,
  glicemia: 100,
  peso_kg: '70.5',
  altura_cm: 175,
  dor_eva: 5,
  observacao: null,
  triagem_em: new Date('2026-04-28T10:05:00Z'),
  triagem_por: 100n,
  created_at: new Date('2026-04-28T10:05:00Z'),
} as const;

describe('RegistrarTriagemUseCase', () => {
  let repo: {
    findAtendimentoByUuid: ReturnType<typeof vi.fn>;
    insertTriagem: ReturnType<typeof vi.fn>;
    updateClassificacaoRisco: ReturnType<typeof vi.fn>;
    findTriagemByUuid: ReturnType<typeof vi.fn>;
  };
  let auditoria: { record: ReturnType<typeof vi.fn> };
  let events: EventEmitter2;
  let useCase: RegistrarTriagemUseCase;

  beforeEach(() => {
    repo = {
      findAtendimentoByUuid: vi.fn(),
      insertTriagem: vi.fn(),
      updateClassificacaoRisco: vi.fn(),
      findTriagemByUuid: vi.fn(),
    };
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
    events = new EventEmitter2();
    useCase = new RegistrarTriagemUseCase(
      repo as never,
      auditoria as never,
      events,
    );
  });

  it('NotFound quando atendimento não existe', async () => {
    repo.findAtendimentoByUuid.mockResolvedValue(null);
    await withCtx(async () => {
      await expect(
        useCase.execute(ATEND_BASE.uuid_externo, {
          classificacao: 'AMARELO',
          queixaPrincipal: 'dor torácica',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('Conflict em estado terminal', async () => {
    repo.findAtendimentoByUuid.mockResolvedValue({
      ...ATEND_BASE,
      status: 'ALTA',
    });
    await withCtx(async () => {
      await expect(
        useCase.execute(ATEND_BASE.uuid_externo, {
          classificacao: 'AMARELO',
          queixaPrincipal: 'dor torácica',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  it('Sinais vitais fora → 422 sem confirmação', async () => {
    repo.findAtendimentoByUuid.mockResolvedValue({ ...ATEND_BASE });
    await withCtx(async () => {
      await expect(
        useCase.execute(ATEND_BASE.uuid_externo, {
          classificacao: 'VERMELHO',
          queixaPrincipal: 'dor torácica',
          paSistolica: 30,
          paDiastolica: 20,
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  it('Override aceito com confirmadoPeloProfissional', async () => {
    repo.findAtendimentoByUuid.mockResolvedValue({ ...ATEND_BASE });
    repo.insertTriagem.mockResolvedValue({
      id: 1n,
      uuid_externo: TRIAGEM_ROW.uuid_externo,
    });
    repo.findTriagemByUuid.mockResolvedValue({ ...TRIAGEM_ROW });
    await withCtx(() =>
      useCase.execute(ATEND_BASE.uuid_externo, {
        classificacao: 'VERMELHO',
        queixaPrincipal: 'PA real 220x140 confirmada',
        paSistolica: 220,
        paDiastolica: 140,
        confirmadoPeloProfissional: true,
      }),
    );
    expect(repo.insertTriagem).toHaveBeenCalledOnce();
    expect(repo.updateClassificacaoRisco).toHaveBeenCalledWith(
      ATEND_BASE.id,
      'VERMELHO',
      100n,
    );
  });

  it('caminho feliz — emite event + audita', async () => {
    repo.findAtendimentoByUuid.mockResolvedValue({ ...ATEND_BASE });
    repo.insertTriagem.mockResolvedValue({
      id: 1n,
      uuid_externo: TRIAGEM_ROW.uuid_externo,
    });
    repo.findTriagemByUuid.mockResolvedValue({ ...TRIAGEM_ROW });

    const emitted: string[] = [];
    events.on('atendimento.triagem.classificada', () =>
      emitted.push('triagem'),
    );

    await withCtx(() =>
      useCase.execute(ATEND_BASE.uuid_externo, {
        classificacao: 'AMARELO',
        queixaPrincipal: 'dor torácica',
        paSistolica: 120,
        paDiastolica: 80,
      }),
    );
    expect(emitted).toEqual(['triagem']);
    expect(auditoria.record).toHaveBeenCalledOnce();
  });
});
