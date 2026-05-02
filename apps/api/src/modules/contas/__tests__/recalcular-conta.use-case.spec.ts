/**
 * Unit do `RecalcularContaUseCase` — RN-FAT-07.
 *
 * Cobre:
 *   - Idempotência: se evento já registrado nas últimas 24h, retorna
 *     `status: 'idempotent'` e não atualiza nada.
 *   - Atualiza valores conforme tabela de preços e ignora itens MANUAL.
 *   - 422 quando status != ABERTA/EM_ELABORACAO.
 */
import { UnprocessableEntityException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RecalcularContaUseCase } from '../application/contas/recalcular-conta.use-case';

const CONTA_UUID = '00000000-0000-4000-8000-000000000c01';
const OP_UUID = '00000000-0000-4000-8000-000000000900';

function buildRepo(opts: {
  jaProcessado?: boolean;
  status?: string;
  itens?: Array<{
    id: bigint;
    procedimento_id: bigint;
    grupo_gasto: string;
    origem: string;
    quantidade: string;
    valor_unitario: string;
  }>;
  valoresTabela?: Record<string, string>;
}) {
  return {
    findContaByUuid: vi.fn(async () => ({
      id: 1n,
      uuid_externo: CONTA_UUID,
      status: opts.status ?? 'EM_ELABORACAO',
      convenio_id: 5n,
      plano_id: null,
      data_abertura: new Date('2026-04-01'),
    })),
    findRecalculoIdempotente: vi.fn(async () => opts.jaProcessado ?? false),
    findItensByContaId: vi.fn(async () => opts.itens ?? []),
    findTabelaPrecosSnapshot: vi.fn(async () => ({
      tabelaId: 1n,
      tabelaCodigo: 'CBHPM',
      tabelaVersao: 12,
      valores: opts.valoresTabela ?? {},
    })),
    updateContaItemValor: vi.fn(async () => undefined),
  };
}

describe('RecalcularContaUseCase', () => {
  let auditoria: { record: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
  });

  it('idempotente: retorna sem atualizar', async () => {
    const repo = buildRepo({ jaProcessado: true });
    const uc = new RecalcularContaUseCase(repo as never, auditoria as never);
    const r = await uc.execute(CONTA_UUID, { operacaoUuid: OP_UUID });
    expect(r.status).toBe('idempotent');
    expect(r.itensAtualizados).toBe(0);
    expect(repo.updateContaItemValor).not.toHaveBeenCalled();
    expect(auditoria.record).not.toHaveBeenCalled();
  });

  it('atualiza valores conforme tabela e ignora MANUAL', async () => {
    const repo = buildRepo({
      itens: [
        {
          id: 10n,
          procedimento_id: 100n,
          grupo_gasto: 'PROCEDIMENTO',
          origem: 'AUTOMATICA',
          quantidade: '1',
          valor_unitario: '40.0000',
        },
        {
          id: 11n,
          procedimento_id: 200n,
          grupo_gasto: 'PROCEDIMENTO',
          origem: 'MANUAL',
          quantidade: '1',
          valor_unitario: '40.0000',
        },
        {
          id: 12n,
          procedimento_id: 300n,
          grupo_gasto: 'HONORARIO',
          origem: 'AUTOMATICA',
          quantidade: '1',
          valor_unitario: '40.0000',
        },
      ],
      valoresTabela: {
        '100': '50.0000',
        '200': '60.0000',
        '300': '70.0000',
      },
    });
    const uc = new RecalcularContaUseCase(repo as never, auditoria as never);
    const r = await uc.execute(CONTA_UUID, { operacaoUuid: OP_UUID });
    expect(r.status).toBe('recalculado');
    expect(r.itensAtualizados).toBe(1);
    // só o item AUTOMATICA não-honorário foi atualizado
    expect(repo.updateContaItemValor).toHaveBeenCalledOnce();
    expect(repo.updateContaItemValor).toHaveBeenCalledWith(
      10n,
      '50.000000',
      '50.000000',
    );
    expect(auditoria.record).toHaveBeenCalledOnce();
    const auditDiff = auditoria.record.mock.calls[0][0];
    expect(auditDiff.diff.operacao_uuid).toBe(OP_UUID);
  });

  it('422 quando status != ABERTA/EM_ELABORACAO', async () => {
    const repo = buildRepo({ status: 'FECHADA' });
    const uc = new RecalcularContaUseCase(repo as never, auditoria as never);
    await expect(
      uc.execute(CONTA_UUID, { operacaoUuid: OP_UUID }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('audita operacao_uuid mesmo quando 0 itens atualizados', async () => {
    const repo = buildRepo({ itens: [], valoresTabela: {} });
    const uc = new RecalcularContaUseCase(repo as never, auditoria as never);
    const r = await uc.execute(CONTA_UUID, { operacaoUuid: OP_UUID });
    expect(r.status).toBe('recalculado');
    expect(r.itensAtualizados).toBe(0);
    expect(auditoria.record).toHaveBeenCalledOnce();
  });
});
