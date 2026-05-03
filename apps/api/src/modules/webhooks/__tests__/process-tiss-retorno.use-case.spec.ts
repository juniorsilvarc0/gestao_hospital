/**
 * Testa `ProcessTissRetornoUseCase`:
 *   - Atualiza protocolo quando lote existe.
 *   - Marca contas pagas idempotente (já paga = sucesso, cancelada =
 *     warning).
 *   - Delega glosas para `ImportarGlosasTissUseCase` repassando
 *     campos.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProcessTissRetornoUseCase } from '../application/process-tiss-retorno.use-case';

function makeRepo(opts: {
  loteId?: bigint | null;
  contas?: Record<string, { id: bigint; status: string }>;
} = {}) {
  const contas = opts.contas ?? {};
  return {
    findLoteTissByNumero: vi.fn(async (numero: string) =>
      opts.loteId === undefined ? null : { id: opts.loteId },
    ),
    updateLoteProtocolo: vi.fn(async () => undefined),
    findContaIdByNumero: vi.fn(async (numero: string) =>
      contas[numero]?.id ?? null,
    ),
    findContaStatusById: vi.fn(async (id: bigint) => {
      const found = Object.values(contas).find((c) => c.id === id);
      return found ? { status: found.status, valor_total: '100.00' } : null;
    }),
    marcarContaPaga: vi.fn(async () => undefined),
  };
}

function makeImportar() {
  return {
    execute: vi.fn(async () => ({
      total: 2,
      importadas: 2,
      comAlerta: [],
      glosas: [],
    })),
  };
}

describe('ProcessTissRetornoUseCase', () => {
  let repo: ReturnType<typeof makeRepo>;
  let imp: ReturnType<typeof makeImportar>;
  let uc: ProcessTissRetornoUseCase;

  beforeEach(() => {
    repo = makeRepo({
      loteId: 99n,
      contas: {
        'CT-001': { id: 1n, status: 'FATURADA' },
        'CT-002': { id: 2n, status: 'PAGA' },
        'CT-003': { id: 3n, status: 'CANCELADA' },
      },
    });
    imp = makeImportar();
    uc = new ProcessTissRetornoUseCase(repo as never, imp as never);
  });

  it('atualiza protocolo do lote quando informado', async () => {
    const out = await uc.execute(7n, {
      loteNumero: 'L-100',
      protocoloOperadora: 'PROT-9',
    });
    expect(out.loteAtualizado).toBe(true);
    expect(repo.updateLoteProtocolo).toHaveBeenCalledWith(99n, 'PROT-9');
  });

  it('reporta alerta quando lote não encontrado', async () => {
    const repoSemLote = makeRepo();
    const ucSem = new ProcessTissRetornoUseCase(repoSemLote as never, imp as never);
    const out = await ucSem.execute(7n, {
      loteNumero: 'L-X',
      protocoloOperadora: 'PROT-1',
    });
    expect(out.loteAtualizado).toBe(false);
    expect(out.contasComAlerta).toContainEqual(
      expect.objectContaining({ contaNumero: 'L-X' }),
    );
  });

  it('processa contas pagas — idempotente para PAGA, ignora CANCELADA', async () => {
    const out = await uc.execute(7n, {
      loteNumero: 'L-100',
      contasPagas: [
        { contaNumero: 'CT-001', valorPago: 100, dataPagamento: '2026-05-01' },
        { contaNumero: 'CT-002', valorPago: 200, dataPagamento: '2026-05-01' },
        { contaNumero: 'CT-003', valorPago: 50, dataPagamento: '2026-05-01' },
        { contaNumero: 'CT-INEXISTENTE', valorPago: 1, dataPagamento: '2026-05-01' },
      ],
    });
    // CT-001 marcada; CT-002 já PAGA (sucesso silencioso); demais alertas.
    expect(out.contasPagas).toBe(2); // CT-001 + CT-002 (já PAGA)
    expect(repo.marcarContaPaga).toHaveBeenCalledTimes(1);
    expect(repo.marcarContaPaga).toHaveBeenCalledWith({
      contaId: 1n,
      valorPago: '100.0000',
    });
    expect(out.contasComAlerta.map((a) => a.contaNumero)).toEqual(
      expect.arrayContaining(['CT-003', 'CT-INEXISTENTE']),
    );
  });

  it('delega glosas para ImportarGlosasTissUseCase', async () => {
    const out = await uc.execute(7n, {
      loteNumero: 'L-100',
      glosas: [
        {
          guiaNumero: 'G-1',
          motivo: 'auth',
          codigoGlosaTiss: '3001',
          valorGlosado: 30,
          dataGlosa: '2026-04-30',
        },
        {
          guiaNumero: 'G-2',
          motivo: 'preço',
          codigoGlosaTiss: '4001',
          valorGlosado: 70,
          dataGlosa: '2026-04-30',
        },
      ],
    });
    expect(imp.execute).toHaveBeenCalledTimes(1);
    const arg = imp.execute.mock.calls[0][0];
    expect(arg.glosas).toHaveLength(2);
    expect(arg.glosas[0]).toMatchObject({
      guiaNumeroPrestador: 'G-1',
      motivo: 'auth',
      codigoGlosaTiss: '3001',
      valorGlosado: 30,
    });
    expect(out.glosasImportadas).toBe(2);
  });
});
