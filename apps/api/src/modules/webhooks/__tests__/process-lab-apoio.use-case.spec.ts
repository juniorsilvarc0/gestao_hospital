/**
 * Testa `ProcessLabApoioUseCase`:
 *   - Cria resultados quando a solicitação + procedimento batem.
 *   - Marca alerta quando item órfão (sem solicitação ou item).
 *   - Usa itemUuid quando fornecido.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProcessLabApoioUseCase } from '../application/process-lab-apoio.use-case';

function makeRepo(opts: {
  solicitacao?: { id: bigint; paciente_id: bigint } | null;
  itemPorCodigo?: Record<string, bigint>;
  itemPorUuid?: Record<
    string,
    { id: bigint; solicitacao_id: bigint; paciente_id: bigint }
  >;
}) {
  return {
    findSolicitacaoExameByCodigo: vi.fn(async (_c: string) => opts.solicitacao ?? null),
    findItemBySolicitacaoAndProcedimento: vi.fn(
      async (_solId: bigint, codigo: string) => {
        const id = opts.itemPorCodigo?.[codigo];
        return id !== undefined ? { id } : null;
      },
    ),
    findItemByUuid: vi.fn(async (uuid: string) =>
      opts.itemPorUuid?.[uuid] ?? null,
    ),
    insertResultadoExterno: vi.fn(async () => ({
      id: 1n,
      uuid_externo: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    })),
  };
}

describe('ProcessLabApoioUseCase', () => {
  let uc: ProcessLabApoioUseCase;
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(() => {
    repo = makeRepo({
      solicitacao: { id: 10n, paciente_id: 99n },
      itemPorCodigo: { '40601-0': 11n, '40602-0': 12n },
      itemPorUuid: {
        'iiiiiiii-iiii-4iii-8iii-iiiiiiiiiiii': {
          id: 22n,
          solicitacao_id: 10n,
          paciente_id: 99n,
        },
      },
    });
    uc = new ProcessLabApoioUseCase(repo as never);
  });

  it('cria resultados via solicitacao + codigo', async () => {
    const out = await uc.execute(7n, {
      solicitacaoCodigo: 'GUIA-1',
      examesResultados: [
        {
          codigoProcedimento: '40601-0',
          resultadoTexto: 'Hemoglobina 14.0 g/dL',
        },
        {
          codigoProcedimento: '40602-0',
          resultadoTexto: 'Plaquetas 250 mil/mm3',
          laudoUrl: 'https://lab.example/laudo-1.pdf',
        },
      ],
    });
    expect(out.resultadosCriados).toBe(2);
    expect(out.itensComAlerta).toHaveLength(0);
    expect(repo.insertResultadoExterno).toHaveBeenCalledTimes(2);
  });

  it('alerta para itens sem item correspondente', async () => {
    const out = await uc.execute(7n, {
      solicitacaoCodigo: 'GUIA-1',
      examesResultados: [
        {
          codigoProcedimento: 'XPTO',
          resultadoTexto: 'X',
        },
      ],
    });
    expect(out.resultadosCriados).toBe(0);
    expect(out.itensComAlerta).toHaveLength(1);
  });

  it('usa itemUuid direto quando fornecido', async () => {
    const out = await uc.execute(7n, {
      solicitacaoCodigo: 'GUIA-1',
      examesResultados: [
        {
          itemUuid: 'iiiiiiii-iiii-4iii-8iii-iiiiiiiiiiii',
          codigoProcedimento: 'IGN',
          resultadoTexto: 'OK',
        },
      ],
    });
    expect(out.resultadosCriados).toBe(1);
    expect(repo.insertResultadoExterno).toHaveBeenCalledWith(
      expect.objectContaining({ solicitacaoItemId: 22n, pacienteId: 99n }),
    );
  });

  it('marca alerta quando solicitacao não existe e item não tem uuid', async () => {
    const repoSem = makeRepo({ solicitacao: null });
    const ucSem = new ProcessLabApoioUseCase(repoSem as never);
    const out = await ucSem.execute(7n, {
      solicitacaoCodigo: 'NX',
      examesResultados: [
        { codigoProcedimento: '40601-0', resultadoTexto: 'X' },
      ],
    });
    expect(out.resultadosCriados).toBe(0);
    expect(out.itensComAlerta).toHaveLength(1);
  });
});
