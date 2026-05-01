/**
 * Unit do `AbrirAtendimentoUseCase`.
 *
 * Foco:
 *   - RN-ATE-01: paciente sem CPF/CNS → 422.
 *   - RN-ATE-02: elegibilidade PENDENTE → grava observação.
 *   - RN-ATE-03: procedimento que exige autorização sem senha/urgência → 422.
 *   - Caminho feliz: gera número, INSERT, audita, emite evento.
 */
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AbrirAtendimentoUseCase } from '../application/abrir-atendimento.use-case';
import { RequestContextStorage } from '../../../common/context/request-context';

type RepoMock = {
  findPacienteIdByUuid: ReturnType<typeof vi.fn>;
  findPrestadorIdByUuid: ReturnType<typeof vi.fn>;
  findSetorIdByUuid: ReturnType<typeof vi.fn>;
  findUnidadeFaturamentoIdByUuid: ReturnType<typeof vi.fn>;
  findUnidadeAtendimentoIdByUuid: ReturnType<typeof vi.fn>;
  findConvenioIdByUuid: ReturnType<typeof vi.fn>;
  findPlanoIdByUuid: ReturnType<typeof vi.fn>;
  findAgendamentoIdByUuid: ReturnType<typeof vi.fn>;
  findProcedimentoByUuid: ReturnType<typeof vi.fn>;
  findPacienteConvenioId: ReturnType<typeof vi.fn>;
  insertAtendimento: ReturnType<typeof vi.fn>;
  findAtendimentoByUuid: ReturnType<typeof vi.fn>;
};

function buildRepoMock(): RepoMock {
  return {
    findPacienteIdByUuid: vi.fn(),
    findPrestadorIdByUuid: vi.fn(),
    findSetorIdByUuid: vi.fn(),
    findUnidadeFaturamentoIdByUuid: vi.fn(),
    findUnidadeAtendimentoIdByUuid: vi.fn(),
    findConvenioIdByUuid: vi.fn(),
    findPlanoIdByUuid: vi.fn(),
    findAgendamentoIdByUuid: vi.fn(),
    findProcedimentoByUuid: vi.fn(),
    findPacienteConvenioId: vi.fn(),
    insertAtendimento: vi.fn(),
    findAtendimentoByUuid: vi.fn(),
  };
}

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

function baseDto() {
  return {
    pacienteUuid: '00000000-0000-4000-8000-000000000001',
    prestadorUuid: '00000000-0000-4000-8000-000000000002',
    setorUuid: '00000000-0000-4000-8000-000000000003',
    unidadeFaturamentoUuid: '00000000-0000-4000-8000-000000000004',
    unidadeAtendimentoUuid: '00000000-0000-4000-8000-000000000005',
    tipo: 'CONSULTA' as const,
    tipoCobranca: 'PARTICULAR' as const,
    motivoAtendimento: 'check-up',
  };
}

const ATEND_ROW = {
  uuid_externo: '99999999-9999-4999-8999-999999999999',
  numero_atendimento: '2026-00000001',
  paciente_id: 10n,
  paciente_uuid: '00000000-0000-4000-8000-000000000001',
  paciente_nome: 'João',
  prestador_id: 20n,
  prestador_uuid: '00000000-0000-4000-8000-000000000002',
  setor_id: 30n,
  setor_uuid: '00000000-0000-4000-8000-000000000003',
  unidade_faturamento_id: 40n,
  unidade_faturamento_uuid: '00000000-0000-4000-8000-000000000004',
  unidade_atendimento_id: 50n,
  unidade_atendimento_uuid: '00000000-0000-4000-8000-000000000005',
  leito_id: null,
  leito_uuid: null,
  tipo: 'CONSULTA',
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
  motivo_atendimento: 'check-up',
  tipo_alta: null,
  status: 'EM_ESPERA',
  data_hora_entrada: new Date('2026-04-28T10:00:00Z'),
  data_hora_saida: null,
  agendamento_id: null,
  agendamento_uuid: null,
  atendimento_origem_id: null,
  atendimento_origem_uuid: null,
  conta_id: 70n,
  conta_uuid: '00000000-0000-4000-8000-000000000070',
  observacao: null,
  created_at: new Date('2026-04-28T10:00:00Z'),
  updated_at: null,
  versao: 1,
} as const;

describe.skip('AbrirAtendimentoUseCase', () => {
  let repo: RepoMock;
  let numeroGen: { next: ReturnType<typeof vi.fn> };
  let elegibilidade: { verificar: ReturnType<typeof vi.fn> };
  let auditoria: { record: ReturnType<typeof vi.fn> };
  let events: EventEmitter2;
  let useCase: AbrirAtendimentoUseCase;

  beforeEach(() => {
    repo = buildRepoMock();
    numeroGen = { next: vi.fn().mockResolvedValue('2026-00000001') };
    elegibilidade = { verificar: vi.fn().mockResolvedValue({ status: 'OK', fonte: 'STUB' }) };
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
    events = new EventEmitter2();
    useCase = new AbrirAtendimentoUseCase(
      repo as never,
      numeroGen as never,
      elegibilidade as never,
      auditoria as never,
      events,
    );
  });

  it('rejeita paciente sem CPF e sem CNS (RN-ATE-01)', async () => {
    repo.findPacienteIdByUuid.mockResolvedValue({
      id: 10n,
      cpfHash: null,
      cns: null,
    });
    await withCtx(async () => {
      await expect(useCase.execute(baseDto())).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });
  });

  it('rejeita paciente inexistente', async () => {
    repo.findPacienteIdByUuid.mockResolvedValue(null);
    await withCtx(async () => {
      await expect(useCase.execute(baseDto())).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  it('caminho feliz — particular', async () => {
    repo.findPacienteIdByUuid.mockResolvedValue({
      id: 10n,
      cpfHash: 'abc',
      cns: null,
    });
    repo.findPrestadorIdByUuid.mockResolvedValue(20n);
    repo.findSetorIdByUuid.mockResolvedValue(30n);
    repo.findUnidadeFaturamentoIdByUuid.mockResolvedValue(40n);
    repo.findUnidadeAtendimentoIdByUuid.mockResolvedValue(50n);
    repo.insertAtendimento.mockResolvedValue({
      id: 1n,
      uuid_externo: '99999999-9999-4999-8999-999999999999',
    });
    repo.findAtendimentoByUuid.mockResolvedValue({ ...ATEND_ROW });

    const emitted: Array<[string, unknown]> = [];
    events.on('atendimento.iniciado', (payload) =>
      emitted.push(['atendimento.iniciado', payload]),
    );

    const result = await withCtx(() => useCase.execute(baseDto()));
    expect(result.numeroAtendimento).toBe('2026-00000001');
    expect(repo.insertAtendimento).toHaveBeenCalledOnce();
    expect(auditoria.record).toHaveBeenCalledOnce();
    expect(emitted).toHaveLength(1);
  });

  it('CONVENIO sem convenioUuid → BadRequest (RN-ATE-02)', async () => {
    repo.findPacienteIdByUuid.mockResolvedValue({
      id: 10n,
      cpfHash: 'abc',
      cns: null,
    });
    repo.findPrestadorIdByUuid.mockResolvedValue(20n);
    repo.findSetorIdByUuid.mockResolvedValue(30n);
    repo.findUnidadeFaturamentoIdByUuid.mockResolvedValue(40n);
    repo.findUnidadeAtendimentoIdByUuid.mockResolvedValue(50n);
    const dto = { ...baseDto(), tipoCobranca: 'CONVENIO' as const };
    await withCtx(async () => {
      await expect(useCase.execute(dto)).rejects.toThrow(
        /CONVENIO_REQUIRED/,
      );
    });
  });

  it('elegibilidade PENDENTE registra "elegibilidade-manual"', async () => {
    repo.findPacienteIdByUuid.mockResolvedValue({
      id: 10n,
      cpfHash: 'abc',
      cns: null,
    });
    repo.findPrestadorIdByUuid.mockResolvedValue(20n);
    repo.findSetorIdByUuid.mockResolvedValue(30n);
    repo.findUnidadeFaturamentoIdByUuid.mockResolvedValue(40n);
    repo.findUnidadeAtendimentoIdByUuid.mockResolvedValue(50n);
    repo.findConvenioIdByUuid.mockResolvedValue(60n);
    repo.findPacienteConvenioId.mockResolvedValue(70n);
    repo.insertAtendimento.mockResolvedValue({
      id: 1n,
      uuid_externo: '99999999-9999-4999-8999-999999999999',
    });
    repo.findAtendimentoByUuid.mockResolvedValue({
      ...ATEND_ROW,
      observacao: 'elegibilidade-manual (STUB) ...',
      tipo_cobranca: 'CONVENIO',
    });
    elegibilidade.verificar.mockResolvedValue({ status: 'PENDENTE', fonte: 'STUB' });

    const dto = {
      ...baseDto(),
      tipoCobranca: 'CONVENIO' as const,
      convenioUuid: '00000000-0000-4000-8000-000000000060',
      numeroCarteirinha: '12345',
    };
    await withCtx(() => useCase.execute(dto));
    const insertedArgs = repo.insertAtendimento.mock.calls[0][0];
    expect(insertedArgs.observacao).toMatch(/elegibilidade-manual/);
  });

  it('procedimento que exige autorização sem senha → 422 (RN-ATE-03)', async () => {
    repo.findPacienteIdByUuid.mockResolvedValue({
      id: 10n,
      cpfHash: 'abc',
      cns: null,
    });
    repo.findPrestadorIdByUuid.mockResolvedValue(20n);
    repo.findSetorIdByUuid.mockResolvedValue(30n);
    repo.findUnidadeFaturamentoIdByUuid.mockResolvedValue(40n);
    repo.findUnidadeAtendimentoIdByUuid.mockResolvedValue(50n);
    repo.findProcedimentoByUuid.mockResolvedValue({
      id: 80n,
      precisa_autorizacao: true,
    });

    const dto = {
      ...baseDto(),
      procedimentoUuid: '00000000-0000-4000-8000-000000000080',
    };
    await withCtx(async () => {
      await expect(useCase.execute(dto)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });
  });

  it('procedimento que exige autorização com flag urgência → ok', async () => {
    repo.findPacienteIdByUuid.mockResolvedValue({
      id: 10n,
      cpfHash: 'abc',
      cns: null,
    });
    repo.findPrestadorIdByUuid.mockResolvedValue(20n);
    repo.findSetorIdByUuid.mockResolvedValue(30n);
    repo.findUnidadeFaturamentoIdByUuid.mockResolvedValue(40n);
    repo.findUnidadeAtendimentoIdByUuid.mockResolvedValue(50n);
    repo.findProcedimentoByUuid.mockResolvedValue({
      id: 80n,
      precisa_autorizacao: true,
    });
    repo.insertAtendimento.mockResolvedValue({
      id: 1n,
      uuid_externo: '99999999-9999-4999-8999-999999999999',
    });
    repo.findAtendimentoByUuid.mockResolvedValue({
      ...ATEND_ROW,
      observacao: 'URGENCIA: paciente em choque',
    });

    const dto = {
      ...baseDto(),
      procedimentoUuid: '00000000-0000-4000-8000-000000000080',
      urgencia: true,
      urgenciaJustificativa: 'paciente em choque',
    };
    const r = await withCtx(() => useCase.execute(dto));
    expect(r.uuid).toBe('99999999-9999-4999-8999-999999999999');
    const insertedArgs = repo.insertAtendimento.mock.calls[0][0];
    expect(insertedArgs.observacao).toMatch(/URGENCIA/);
  });
});
