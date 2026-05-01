/**
 * Unit do `LaudarResultadoUseCase` (RN-LAB-04, INVARIANTE #3).
 *
 * Cobertura:
 *   - 404 em resultado inexistente.
 *   - 409 em resultado já assinado.
 *   - 403 em usuário sem prestador vinculado.
 *   - Caminho feliz: assina → UPDATE → propaga itens/parent → audit + emit.
 */
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LaudarResultadoUseCase } from '../application/laudar-resultado.use-case';
import { RequestContextStorage } from '../../../common/context/request-context';

type RepoMock = {
  findResultadoByUuid: ReturnType<typeof vi.fn>;
  findPrestadorIdByUserId: ReturnType<typeof vi.fn>;
  laudarResultado: ReturnType<typeof vi.fn>;
  setItemStatus: ReturnType<typeof vi.fn>;
  findSolicitacaoByUuid: ReturnType<typeof vi.fn>;
  recomputeSolicitacaoStatus: ReturnType<typeof vi.fn>;
};

function buildRepoMock(): RepoMock {
  return {
    findResultadoByUuid: vi.fn(),
    findPrestadorIdByUserId: vi.fn(),
    laudarResultado: vi.fn().mockResolvedValue(undefined),
    setItemStatus: vi.fn().mockResolvedValue(undefined),
    findSolicitacaoByUuid: vi.fn(),
    recomputeSolicitacaoStatus: vi.fn().mockResolvedValue(undefined),
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

const RES_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SOL_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SOL_ITEM_UUID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const RES_ROW_BASE = {
  id: 5n,
  uuid_externo: RES_UUID,
  tenant_id: 1n,
  solicitacao_item_id: 7n,
  solicitacao_item_uuid: SOL_ITEM_UUID,
  solicitacao_uuid: SOL_UUID,
  paciente_id: 20n,
  paciente_uuid: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  laudista_id: null,
  laudista_uuid: null,
  procedimento_uuid: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  procedimento_nome: 'Hemograma',
  data_coleta: new Date('2026-04-28T10:00:00Z'),
  data_processamento: new Date('2026-04-28T11:00:00Z'),
  data_laudo: null,
  laudo_estruturado: null,
  laudo_texto: 'Laudo descritivo',
  laudo_pdf_url: null,
  imagens_urls: null,
  status: 'LAUDO_PARCIAL' as const,
  assinatura_digital: null,
  assinado_em: null,
  versao_anterior_id: null,
  versao_anterior_uuid: null,
  created_at: new Date('2026-04-28T11:30:00Z'),
};

class StubSigner {
  assinar = vi.fn().mockResolvedValue({
    assinaturaId: 'sig-1',
    assinadoEm: new Date('2026-04-28T12:00:00Z'),
    jsonb: {
      assinaturaId: 'sig-1',
      certInfo: {
        issuer: 'AC HMS-BR DEV',
        subject: 'usuario:100',
        serial: '00DEV0000',
        notBefore: '2026-01-01T00:00:00Z',
        notAfter: '2030-12-31T23:59:59Z',
      },
      hash: 'aabbcc',
      timestamp: '2026-04-28T12:00:00Z',
      algoritmo: 'SHA256withRSA',
      stub: true,
    },
  });
}

describe('LaudarResultadoUseCase', () => {
  let repo: RepoMock;
  let auditoria: { record: ReturnType<typeof vi.fn> };
  let events: EventEmitter2;
  let signer: StubSigner;
  let useCase: LaudarResultadoUseCase;

  beforeEach(() => {
    repo = buildRepoMock();
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
    events = new EventEmitter2();
    signer = new StubSigner();
    useCase = new LaudarResultadoUseCase(
      repo as never,
      auditoria as never,
      events,
      signer as never,
    );
  });

  it('rejeita resultado inexistente', async () => {
    repo.findResultadoByUuid.mockResolvedValue(null);
    await withCtx(async () => {
      await expect(useCase.execute(RES_UUID, {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  it('rejeita resultado já assinado (INVARIANTE #3)', async () => {
    repo.findResultadoByUuid.mockResolvedValue({
      ...RES_ROW_BASE,
      assinado_em: new Date('2026-04-27T10:00:00Z'),
    });
    await withCtx(async () => {
      await expect(useCase.execute(RES_UUID, {})).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  it('rejeita usuário sem prestador vinculado', async () => {
    repo.findResultadoByUuid.mockResolvedValue({ ...RES_ROW_BASE });
    repo.findPrestadorIdByUserId.mockResolvedValue(null);
    await withCtx(async () => {
      await expect(useCase.execute(RES_UUID, {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  it('caminho feliz: assina + atualiza item + recompute parent + audit + event', async () => {
    repo.findResultadoByUuid
      .mockResolvedValueOnce({ ...RES_ROW_BASE })
      .mockResolvedValueOnce({
        ...RES_ROW_BASE,
        assinado_em: new Date('2026-04-28T12:00:00Z'),
        status: 'LAUDO_FINAL',
        laudista_id: 50n,
        laudista_uuid: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        data_laudo: new Date('2026-04-28T12:00:00Z'),
      });
    repo.findPrestadorIdByUserId.mockResolvedValue(50n);
    repo.findSolicitacaoByUuid.mockResolvedValue({
      id: 99n,
      uuid_externo: SOL_UUID,
    });

    const captured: Array<{ name: string; payload: unknown }> = [];
    events.on('exame.laudo.assinado', (payload) =>
      captured.push({ name: 'exame.laudo.assinado', payload }),
    );

    const result = await withCtx(() => useCase.execute(RES_UUID, {}));

    expect(signer.assinar).toHaveBeenCalledOnce();
    const signerArgs = signer.assinar.mock.calls[0][0];
    expect(signerArgs.documentoTipo).toBe('RESULTADO_EXAME');
    expect(signerArgs.signatario).toEqual({
      usuarioId: 100n,
      prestadorId: 50n,
    });

    expect(repo.laudarResultado).toHaveBeenCalledOnce();
    const laudarArgs = repo.laudarResultado.mock.calls[0][0];
    expect(laudarArgs.resultadoId).toBe(5n);
    expect(laudarArgs.laudistaId).toBe(50n);
    expect(laudarArgs.assinaturaJsonb.hash).toBe('aabbcc');

    expect(repo.setItemStatus).toHaveBeenCalledWith(7n, 'LAUDO_FINAL');
    expect(repo.recomputeSolicitacaoStatus).toHaveBeenCalledWith(99n);
    expect(auditoria.record).toHaveBeenCalledOnce();
    expect(captured).toHaveLength(1);
    expect(result.status).toBe('LAUDO_FINAL');
    expect(result.assinadoEm).toBe('2026-04-28T12:00:00.000Z');
  });
});
