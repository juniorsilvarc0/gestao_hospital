/**
 * Unit do `EnviarLoteUseCase`.
 *
 * Cobre:
 *   - 404 quando lote não existe.
 *   - 422 quando lote NÃO está VALIDADO (RN-FAT-04).
 *   - Caminho feliz: status → ENVIADO + guias VALIDADA → ENVIADA.
 */
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EnviarLoteUseCase } from '../application/lotes/enviar-lote.use-case';
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

const LOTE_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const LOTE_VALIDADO = {
  id: 50n,
  uuid_externo: LOTE_UUID,
  tenant_id: 1n,
  convenio_id: 99n,
  convenio_uuid: '00000000-0000-4000-8000-000000000099',
  convenio_nome: 'Conv',
  convenio_registro_ans: '987654',
  numero_lote: '0001',
  versao_tiss: '4.01.00',
  competencia: '2026-04',
  data_geracao: new Date(),
  data_validacao: new Date(),
  data_envio: null,
  data_processamento: null,
  qtd_guias: 2,
  valor_total: '200.00',
  hash_xml: 'a'.repeat(64),
  xml_url: null,
  protocolo_operadora: null,
  status: 'VALIDADO' as const,
  validacao_xsd_erros: null,
  lote_anterior_id: null,
  lote_anterior_uuid: null,
  observacao: null,
  created_at: new Date(),
  updated_at: null,
};

interface RepoMock {
  findLoteByUuid: ReturnType<typeof vi.fn>;
  updateLoteEnvio: ReturnType<typeof vi.fn>;
  findGuiasByLote: ReturnType<typeof vi.fn>;
  updateGuiaStatus: ReturnType<typeof vi.fn>;
}

function buildRepo(): RepoMock {
  return {
    findLoteByUuid: vi.fn(),
    updateLoteEnvio: vi.fn().mockResolvedValue(undefined),
    findGuiasByLote: vi.fn().mockResolvedValue([]),
    updateGuiaStatus: vi.fn().mockResolvedValue(undefined),
  };
}

describe('EnviarLoteUseCase', () => {
  let repo: RepoMock;
  let auditoria: { record: ReturnType<typeof vi.fn> };
  let useCase: EnviarLoteUseCase;

  beforeEach(() => {
    repo = buildRepo();
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
    useCase = new EnviarLoteUseCase(repo as never, auditoria as never);
    repo.findLoteByUuid.mockResolvedValue({ ...LOTE_VALIDADO });
  });

  it('404 quando lote não existe', async () => {
    repo.findLoteByUuid.mockResolvedValueOnce(null);
    await withCtx(async () => {
      await expect(useCase.execute(LOTE_UUID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  it('422 quando lote não está VALIDADO', async () => {
    repo.findLoteByUuid.mockResolvedValueOnce({
      ...LOTE_VALIDADO,
      status: 'GERADO',
    });
    await withCtx(async () => {
      await expect(useCase.execute(LOTE_UUID)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });
  });

  it('422 quando lote já ENVIADO (imutável)', async () => {
    repo.findLoteByUuid.mockResolvedValueOnce({
      ...LOTE_VALIDADO,
      status: 'ENVIADO',
    });
    await withCtx(async () => {
      await expect(useCase.execute(LOTE_UUID)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });
  });

  it('caminho feliz: enviado e guias VALIDADA viram ENVIADA', async () => {
    repo.findGuiasByLote.mockResolvedValue([
      { id: 1n, status: 'VALIDADA' },
      { id: 2n, status: 'GERADA' }, // não promove (não está VALIDADA)
    ]);
    await withCtx(() => useCase.execute(LOTE_UUID));
    expect(repo.updateLoteEnvio).toHaveBeenCalledOnce();
    expect(repo.updateGuiaStatus).toHaveBeenCalledTimes(1);
    const args = repo.updateGuiaStatus.mock.calls[0][0] as Record<string, unknown>;
    expect(args.id).toBe(1n);
    expect(args.status).toBe('ENVIADA');
    expect(auditoria.record).toHaveBeenCalledOnce();
  });
});
