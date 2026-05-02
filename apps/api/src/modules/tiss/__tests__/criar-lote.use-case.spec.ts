/**
 * Unit do `CriarLoteUseCase`.
 *
 * Cobre:
 *   - 404 quando convênio inexistente.
 *   - 422 quando guia não está em GERADA.
 *   - 422 quando guia já está em outro lote.
 *   - 422 quando guias têm convênio divergente.
 *   - 422 quando guias têm versão TISS divergente.
 *   - Caminho feliz: insere lote + vincula N guias + audita + evento.
 *   - getNextNumeroLote é chamado quando numeroLote não fornecido.
 */
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CriarLoteUseCase } from '../application/lotes/criar-lote.use-case';
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

const CONVENIO_UUID = '00000000-0000-4000-8000-000000000099';
const GUIA1_UUID = '00000000-0000-4000-8000-000000000a01';
const GUIA2_UUID = '00000000-0000-4000-8000-000000000a02';
const LOTE_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONTA_UUID = '00000000-0000-4000-8000-000000000010';

interface RepoMock {
  findConvenioIdByUuid: ReturnType<typeof vi.fn>;
  findGuiaByUuid: ReturnType<typeof vi.fn>;
  findContaByUuid: ReturnType<typeof vi.fn>;
  getNextNumeroLote: ReturnType<typeof vi.fn>;
  insertLote: ReturnType<typeof vi.fn>;
  attachGuiaToLote: ReturnType<typeof vi.fn>;
  findLoteByUuid: ReturnType<typeof vi.fn>;
}

function buildRepo(): RepoMock {
  return {
    findConvenioIdByUuid: vi.fn(),
    findGuiaByUuid: vi.fn(),
    findContaByUuid: vi.fn(),
    getNextNumeroLote: vi.fn(),
    insertLote: vi.fn(),
    attachGuiaToLote: vi.fn().mockResolvedValue(undefined),
    findLoteByUuid: vi.fn(),
  };
}

const GUIA_BASE = {
  id: 1n,
  uuid_externo: GUIA1_UUID,
  tenant_id: 1n,
  conta_id: 10n,
  conta_uuid: CONTA_UUID,
  lote_id: null,
  lote_uuid: null,
  tipo_guia: 'SP_SADT',
  versao_tiss: '4.01.00',
  numero_guia_prestador: 'G-001',
  numero_guia_operadora: null,
  senha_autorizacao: null,
  hash_xml: 'a'.repeat(64),
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
};

const CONTA_ROW = {
  id: 10n,
  convenio_id: 99n,
  uuid_externo: CONTA_UUID,
} as Record<string, unknown>;

describe('CriarLoteUseCase', () => {
  let repo: RepoMock;
  let auditoria: { record: ReturnType<typeof vi.fn> };
  let events: EventEmitter2;
  let useCase: CriarLoteUseCase;

  beforeEach(() => {
    repo = buildRepo();
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
    events = new EventEmitter2();
    useCase = new CriarLoteUseCase(
      repo as never,
      auditoria as never,
      events,
    );
    repo.findConvenioIdByUuid.mockResolvedValue(99n);
    repo.findContaByUuid.mockResolvedValue(CONTA_ROW);
    repo.getNextNumeroLote.mockResolvedValue('0001');
    repo.insertLote.mockResolvedValue({ id: 50n, uuidExterno: LOTE_UUID });
    repo.findLoteByUuid.mockResolvedValue({
      id: 50n,
      uuid_externo: LOTE_UUID,
      tenant_id: 1n,
      convenio_id: 99n,
      convenio_uuid: CONVENIO_UUID,
      convenio_nome: 'Conv',
      convenio_registro_ans: '987654',
      numero_lote: '0001',
      versao_tiss: '4.01.00',
      competencia: '2026-04',
      data_geracao: new Date(),
      data_validacao: null,
      data_envio: null,
      data_processamento: null,
      qtd_guias: 1,
      valor_total: '100.00',
      hash_xml: null,
      xml_url: null,
      protocolo_operadora: null,
      status: 'GERADO',
      validacao_xsd_erros: null,
      lote_anterior_id: null,
      lote_anterior_uuid: null,
      observacao: null,
      created_at: new Date(),
      updated_at: null,
    });
  });

  it('404 quando convênio não encontrado', async () => {
    repo.findConvenioIdByUuid.mockResolvedValue(null);
    await withCtx(async () => {
      await expect(
        useCase.execute({
          convenioUuid: CONVENIO_UUID,
          competencia: '2026-04',
          guiaUuids: [GUIA1_UUID],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('422 quando guia não está GERADA', async () => {
    repo.findGuiaByUuid.mockResolvedValue({ ...GUIA_BASE, status: 'VALIDADA' });
    await withCtx(async () => {
      await expect(
        useCase.execute({
          convenioUuid: CONVENIO_UUID,
          competencia: '2026-04',
          guiaUuids: [GUIA1_UUID],
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  it('422 quando guia já vinculada a outro lote', async () => {
    repo.findGuiaByUuid.mockResolvedValue({
      ...GUIA_BASE,
      lote_id: 999n,
      lote_uuid: 'outro-uuid',
    });
    await withCtx(async () => {
      await expect(
        useCase.execute({
          convenioUuid: CONVENIO_UUID,
          competencia: '2026-04',
          guiaUuids: [GUIA1_UUID],
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  it('422 quando convênio das guias diverge do convênio do lote', async () => {
    repo.findGuiaByUuid.mockResolvedValue({ ...GUIA_BASE });
    // conta retorna convênio diferente
    repo.findContaByUuid.mockResolvedValue({ ...CONTA_ROW, convenio_id: 77n });
    await withCtx(async () => {
      await expect(
        useCase.execute({
          convenioUuid: CONVENIO_UUID,
          competencia: '2026-04',
          guiaUuids: [GUIA1_UUID],
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  it('422 quando versões TISS divergem entre guias', async () => {
    repo.findGuiaByUuid.mockImplementation(async (uuid: string) => {
      if (uuid === GUIA1_UUID) return { ...GUIA_BASE };
      return { ...GUIA_BASE, uuid_externo: GUIA2_UUID, versao_tiss: '4.00.00' };
    });
    await withCtx(async () => {
      await expect(
        useCase.execute({
          convenioUuid: CONVENIO_UUID,
          competencia: '2026-04',
          guiaUuids: [GUIA1_UUID, GUIA2_UUID],
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  it('caminho feliz — insere lote + vincula guias + audita + evento', async () => {
    repo.findGuiaByUuid.mockImplementation(async (uuid: string) => {
      if (uuid === GUIA1_UUID) return { ...GUIA_BASE };
      return { ...GUIA_BASE, id: 2n, uuid_externo: GUIA2_UUID };
    });
    const emitted: string[] = [];
    events.on('tiss.lote.criado', () => emitted.push('criado'));

    const out = await withCtx(() =>
      useCase.execute({
        convenioUuid: CONVENIO_UUID,
        competencia: '2026-04',
        guiaUuids: [GUIA1_UUID, GUIA2_UUID],
      }),
    );
    expect(out.numeroLote).toBe('0001');
    expect(repo.getNextNumeroLote).toHaveBeenCalledOnce();
    expect(repo.insertLote).toHaveBeenCalledOnce();
    expect(repo.attachGuiaToLote).toHaveBeenCalledTimes(2);
    expect(auditoria.record).toHaveBeenCalledOnce();
    expect(emitted).toEqual(['criado']);
  });

  it('numeroLote fornecido pelo cliente é respeitado (sem MAX+1)', async () => {
    repo.findGuiaByUuid.mockResolvedValue({ ...GUIA_BASE });
    await withCtx(() =>
      useCase.execute({
        convenioUuid: CONVENIO_UUID,
        competencia: '2026-04',
        guiaUuids: [GUIA1_UUID],
        numeroLote: '0042',
      }),
    );
    expect(repo.getNextNumeroLote).not.toHaveBeenCalled();
    const insertArg = repo.insertLote.mock.calls[0][0] as Record<string, unknown>;
    expect(insertArg.numeroLote).toBe('0042');
  });
});
