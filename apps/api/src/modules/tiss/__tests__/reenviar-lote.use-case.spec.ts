/**
 * Unit do `ReenviarLoteUseCase`.
 *
 * Cobre:
 *   - 404 quando lote anterior não existe.
 *   - 422 quando lote anterior está em status que não permite reenvio.
 *   - Caminho feliz: cria novo lote com `lote_anterior_id` = anterior + vincula
 *     guias (cópia ou substituição).
 */
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReenviarLoteUseCase } from '../application/lotes/reenviar-lote.use-case';
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

const LOTE_ANTERIOR_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NOVO_LOTE_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

interface RepoMock {
  findLoteAnteriorByUuid: ReturnType<typeof vi.fn>;
  findGuiaByUuid: ReturnType<typeof vi.fn>;
  findContaByUuid: ReturnType<typeof vi.fn>;
  findGuiasByLote: ReturnType<typeof vi.fn>;
  getNextNumeroLote: ReturnType<typeof vi.fn>;
  insertLote: ReturnType<typeof vi.fn>;
  attachGuiaToLote: ReturnType<typeof vi.fn>;
  findLoteByUuid: ReturnType<typeof vi.fn>;
}

function buildRepo(): RepoMock {
  return {
    findLoteAnteriorByUuid: vi.fn(),
    findGuiaByUuid: vi.fn(),
    findContaByUuid: vi.fn(),
    findGuiasByLote: vi.fn().mockResolvedValue([]),
    getNextNumeroLote: vi.fn().mockResolvedValue('0002'),
    insertLote: vi.fn(),
    attachGuiaToLote: vi.fn().mockResolvedValue(undefined),
    findLoteByUuid: vi.fn(),
  };
}

const ANTERIOR_INFO = {
  id: 50n,
  convenioId: 99n,
  competencia: '2026-04',
  versaoTiss: '4.01.00',
  status: 'ENVIADO' as const,
};

describe('ReenviarLoteUseCase', () => {
  let repo: RepoMock;
  let auditoria: { record: ReturnType<typeof vi.fn> };
  let events: EventEmitter2;
  let useCase: ReenviarLoteUseCase;

  beforeEach(() => {
    repo = buildRepo();
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
    events = new EventEmitter2();
    useCase = new ReenviarLoteUseCase(
      repo as never,
      auditoria as never,
      events,
    );
    repo.findLoteAnteriorByUuid.mockResolvedValue({ ...ANTERIOR_INFO });
    repo.findGuiasByLote.mockResolvedValue([
      { id: 1n, valor_total: '100.00' },
      { id: 2n, valor_total: '50.00' },
    ]);
    repo.insertLote.mockResolvedValue({
      id: 51n,
      uuidExterno: NOVO_LOTE_UUID,
    });
    repo.findLoteByUuid.mockResolvedValue({
      id: 51n,
      uuid_externo: NOVO_LOTE_UUID,
      tenant_id: 1n,
      convenio_id: 99n,
      convenio_uuid: '00000000-0000-4000-8000-000000000099',
      convenio_nome: 'Conv',
      convenio_registro_ans: '987654',
      numero_lote: '0002',
      versao_tiss: '4.01.00',
      competencia: '2026-04',
      data_geracao: new Date(),
      data_validacao: null,
      data_envio: null,
      data_processamento: null,
      qtd_guias: 2,
      valor_total: '150.00',
      hash_xml: null,
      xml_url: null,
      protocolo_operadora: null,
      status: 'GERADO',
      validacao_xsd_erros: null,
      lote_anterior_id: 50n,
      lote_anterior_uuid: LOTE_ANTERIOR_UUID,
      observacao: null,
      created_at: new Date(),
      updated_at: null,
    });
  });

  it('404 quando lote anterior não encontrado', async () => {
    repo.findLoteAnteriorByUuid.mockResolvedValueOnce(null);
    await withCtx(async () => {
      await expect(
        useCase.execute(LOTE_ANTERIOR_UUID, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('422 quando lote anterior em GERADO (ainda não foi enviado)', async () => {
    repo.findLoteAnteriorByUuid.mockResolvedValueOnce({
      ...ANTERIOR_INFO,
      status: 'GERADO',
    });
    await withCtx(async () => {
      await expect(
        useCase.execute(LOTE_ANTERIOR_UUID, {}),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  it('caminho feliz: novo lote vinculado via lote_anterior_id', async () => {
    const emitted: string[] = [];
    events.on('tiss.lote.reenviado', () => emitted.push('reenviado'));

    const out = await withCtx(() =>
      useCase.execute(LOTE_ANTERIOR_UUID, { observacao: 'Reenvio pós-glosa' }),
    );

    expect(out.uuid).toBe(NOVO_LOTE_UUID);
    expect(repo.insertLote).toHaveBeenCalledOnce();
    const insertArg = repo.insertLote.mock.calls[0][0] as Record<string, unknown>;
    expect(insertArg.loteAnteriorId).toBe(50n);
    expect(insertArg.competencia).toBe('2026-04');
    expect(insertArg.versaoTiss).toBe('4.01.00');
    expect(insertArg.qtdGuias).toBe(2);

    expect(repo.attachGuiaToLote).toHaveBeenCalledTimes(2);
    expect(auditoria.record).toHaveBeenCalledOnce();
    expect(emitted).toEqual(['reenviado']);
  });

  it('reenvio com guiaUuids alternativas valida convênio + versão', async () => {
    repo.findGuiaByUuid.mockResolvedValue({
      id: 99n,
      uuid_externo: '00000000-0000-4000-8000-0000000000ff',
      conta_uuid: '00000000-0000-4000-8000-000000000010',
      versao_tiss: '4.01.00',
      valor_total: '200.00',
      status: 'GERADA',
      lote_id: null,
      lote_uuid: null,
    });
    repo.findContaByUuid.mockResolvedValue({
      id: 10n,
      convenio_id: 99n,
    });
    await withCtx(() =>
      useCase.execute(LOTE_ANTERIOR_UUID, {
        guiaUuids: ['00000000-0000-4000-8000-0000000000ff'],
      }),
    );
    expect(repo.findGuiasByLote).not.toHaveBeenCalled();
    expect(repo.attachGuiaToLote).toHaveBeenCalledOnce();
  });
});
