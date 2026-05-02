/**
 * Unit do `GerarGuiasUseCase`.
 *
 * Cobre:
 *   - 404 quando conta não existe.
 *   - 422 quando conta não tem convênio.
 *   - 422 quando versão TISS não é suportada.
 *   - Caminho feliz SP_SADT — gera 1 guia válida + audita + emite event.
 *   - Caminho feliz HONORARIOS — `cirurgia_funcao` viaja no input.
 *   - Tipos sem itens viram `tiposIgnorados` (não geram INSERT).
 */
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GerarGuiasUseCase } from '../application/guias/gerar-guias.use-case';
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

const CONTA_UUID = '00000000-0000-4000-8000-000000000010';
const GUIA_UUID = '99999999-9999-4999-8999-999999999999';

interface RepoMock {
  findContaByUuid: ReturnType<typeof vi.fn>;
  findVersaoTissByConvenio: ReturnType<typeof vi.fn>;
  findContaItensByConta: ReturnType<typeof vi.fn>;
  insertGuia: ReturnType<typeof vi.fn>;
  attachItensToGuia: ReturnType<typeof vi.fn>;
  findGuiaByUuid: ReturnType<typeof vi.fn>;
}

function buildRepo(): RepoMock {
  return {
    findContaByUuid: vi.fn(),
    findVersaoTissByConvenio: vi.fn(),
    findContaItensByConta: vi.fn(),
    insertGuia: vi.fn(),
    attachItensToGuia: vi.fn().mockResolvedValue(undefined),
    findGuiaByUuid: vi.fn(),
  };
}

function buildContaRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 10n,
    uuid_externo: CONTA_UUID,
    tenant_id: 1n,
    numero_conta: 'CONT-001',
    status: 'FECHADA',
    tipo_cobranca: 'CONVENIO',
    atendimento_id: 1n,
    paciente_id: 1n,
    convenio_id: 99n,
    plano_id: 11n,
    numero_guia_principal: 'PG-001',
    versao_tiss_snapshot: '4.01.00',
    valor_total: '500.00',
    atendimento_uuid: '00000000-0000-4000-8000-000000000001',
    atendimento_data_entrada: new Date('2026-04-30T08:00:00Z'),
    atendimento_data_saida: new Date('2026-05-01T08:00:00Z'),
    numero_carteirinha: '0001234567',
    numero_guia_operadora: 'OP-001',
    senha_autorizacao: 'SENHA-1',
    paciente_uuid: '00000000-0000-4000-8000-000000000002',
    paciente_nome: 'João da Silva',
    convenio_uuid: '00000000-0000-4000-8000-000000000099',
    convenio_nome: 'Convenio Teste',
    convenio_registro_ans: '987654',
    convenio_versao_tiss: '4.01.00',
    plano_nome: 'Plano A',
    tenant_nome: 'Hospital Teste',
    tenant_cnpj: '12.345.678/0001-99',
    tenant_registro_ans: '123456',
    ...overrides,
  };
}

function makeItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1n,
    uuid_externo: '00000000-0000-4000-8000-000000000111',
    conta_id: 10n,
    procedimento_id: 200n,
    procedimento_codigo_tuss: '10101012',
    procedimento_nome: 'Consulta médica',
    procedimento_tabela: 'TUSS',
    grupo_gasto: 'PROCEDIMENTO',
    origem: 'EXAME',
    origem_referencia_id: null,
    origem_referencia_tipo: null,
    quantidade: '1',
    valor_unitario: '100.00',
    valor_total: '100.00',
    data_realizacao: new Date('2026-04-30T10:00:00Z'),
    lote: null,
    registro_anvisa: null,
    fabricante: null,
    tabela_tiss_origem: 'TUSS',
    guia_tiss_id: null,
    prestador_executante_id: null,
    prestador_executante_nome: null,
    cirurgia_funcao: null,
    ...overrides,
  };
}

describe('GerarGuiasUseCase', () => {
  let repo: RepoMock;
  let auditoria: { record: ReturnType<typeof vi.fn> };
  let events: EventEmitter2;
  let useCase: GerarGuiasUseCase;

  beforeEach(() => {
    repo = buildRepo();
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
    events = new EventEmitter2();
    useCase = new GerarGuiasUseCase(
      repo as never,
      auditoria as never,
      events,
    );
    repo.insertGuia.mockResolvedValue({ id: 7n, uuidExterno: GUIA_UUID });
    repo.findGuiaByUuid.mockResolvedValue({
      id: 7n,
      uuid_externo: GUIA_UUID,
      tenant_id: 1n,
      conta_id: 10n,
      conta_uuid: CONTA_UUID,
      lote_id: null,
      lote_uuid: null,
      tipo_guia: 'SP_SADT',
      versao_tiss: '4.01.00',
      numero_guia_prestador: 'CONT-001-SAD-001',
      numero_guia_operadora: 'OP-001',
      senha_autorizacao: 'SENHA-1',
      hash_xml: 'a'.repeat(64),
      valor_total: '100.00',
      status: 'GERADA',
      validacao_xsd_status: 'OK',
      validacao_xsd_erros: null,
      data_geracao: new Date('2026-05-01T10:00:00Z'),
      data_validacao: null,
      data_envio: null,
      data_resposta: null,
      motivo_recusa: null,
      created_at: new Date('2026-05-01T10:00:00Z'),
    });
  });

  it('404 quando conta não existe', async () => {
    repo.findContaByUuid.mockResolvedValue(null);
    await withCtx(async () => {
      await expect(
        useCase.execute({ contaUuid: CONTA_UUID }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('422 quando conta sem convênio', async () => {
    repo.findContaByUuid.mockResolvedValue(buildContaRow({ convenio_id: null }));
    await withCtx(async () => {
      await expect(
        useCase.execute({ contaUuid: CONTA_UUID }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  it('422 quando versão TISS não suportada', async () => {
    repo.findContaByUuid.mockResolvedValue(
      buildContaRow({
        versao_tiss_snapshot: '3.00.00',
        convenio_versao_tiss: '3.00.00',
      }),
    );
    repo.findVersaoTissByConvenio.mockResolvedValue('3.00.00');
    await withCtx(async () => {
      await expect(
        useCase.execute({ contaUuid: CONTA_UUID }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  it('caminho feliz SP_SADT — gera 1 guia + audita + evento', async () => {
    repo.findContaByUuid.mockResolvedValue(buildContaRow());
    // Apenas SP_SADT tem itens; demais retornam vazio.
    repo.findContaItensByConta.mockImplementation(
      async (args: { grupos: string[] }) => {
        if (args.grupos.includes('PROCEDIMENTO')) {
          return [makeItem({ origem: 'EXAME' })];
        }
        return [];
      },
    );
    const emitted: string[] = [];
    events.on('tiss.guia.gerada', () => emitted.push('gerada'));

    const out = await withCtx(() =>
      useCase.execute({ contaUuid: CONTA_UUID, tipos: ['SP_SADT'] }),
    );

    expect(out.guias).toHaveLength(1);
    expect(repo.insertGuia).toHaveBeenCalledOnce();
    expect(repo.attachItensToGuia).toHaveBeenCalledWith(7n, [1n]);
    expect(auditoria.record).toHaveBeenCalledOnce();
    expect(emitted).toEqual(['gerada']);

    // valida que o XML chegou ao insert válido (status OK)
    const insertArg = repo.insertGuia.mock.calls[0][0] as Record<string, unknown>;
    expect(insertArg.tipo).toBe('SP_SADT');
    expect(insertArg.validacaoStatus).toBe('OK');
    expect(typeof insertArg.xmlConteudo).toBe('string');
    expect((insertArg.xmlConteudo as string).startsWith('<?xml')).toBe(true);
    expect(insertArg.hashXml as string).toMatch(/^[0-9a-f]{64}$/);
  });

  it('HONORARIOS — propaga cirurgia_funcao para builder', async () => {
    repo.findContaByUuid.mockResolvedValue(buildContaRow());
    repo.findContaItensByConta.mockImplementation(
      async (args: { grupos: string[] }) => {
        if (args.grupos.includes('HONORARIO')) {
          return [
            makeItem({
              id: 5n,
              uuid_externo: '00000000-0000-4000-8000-000000000555',
              grupo_gasto: 'HONORARIO',
              origem: 'CIRURGIA',
              cirurgia_funcao: 'CIRURGIAO',
            }),
          ];
        }
        return [];
      },
    );
    repo.findGuiaByUuid.mockResolvedValue({
      id: 7n,
      uuid_externo: GUIA_UUID,
      tenant_id: 1n,
      conta_id: 10n,
      conta_uuid: CONTA_UUID,
      lote_id: null,
      lote_uuid: null,
      tipo_guia: 'HONORARIOS',
      versao_tiss: '4.01.00',
      numero_guia_prestador: 'CONT-001-HON-001',
      numero_guia_operadora: 'OP-001',
      senha_autorizacao: 'SENHA-1',
      hash_xml: 'b'.repeat(64),
      valor_total: '100.00',
      status: 'GERADA',
      validacao_xsd_status: 'OK',
      validacao_xsd_erros: null,
      data_geracao: new Date(),
      data_validacao: null,
      data_envio: null,
      data_resposta: null,
      motivo_recusa: null,
      created_at: new Date(),
    });
    const out = await withCtx(() =>
      useCase.execute({ contaUuid: CONTA_UUID, tipos: ['HONORARIOS'] }),
    );
    expect(out.guias).toHaveLength(1);
    expect(out.tiposIgnorados).toEqual([]);
    const insertArg = repo.insertGuia.mock.calls[0][0] as Record<string, unknown>;
    expect(insertArg.tipo).toBe('HONORARIOS');
  });

  it('tipos sem itens compatíveis vão para tiposIgnorados', async () => {
    repo.findContaByUuid.mockResolvedValue(buildContaRow());
    repo.findContaItensByConta.mockResolvedValue([]); // todas as queries retornam vazio
    const out = await withCtx(() =>
      useCase.execute({
        contaUuid: CONTA_UUID,
        tipos: ['SP_SADT', 'OUTRAS_DESPESAS'],
      }),
    );
    expect(out.guias).toHaveLength(0);
    expect(out.tiposIgnorados).toEqual(['SP_SADT', 'OUTRAS_DESPESAS']);
    expect(repo.insertGuia).not.toHaveBeenCalled();
  });
});
