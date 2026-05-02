/**
 * Testes do `inconsistency-checker` — cobre cada código.
 */
import { describe, expect, it } from 'vitest';

import {
  checkInconsistencias,
  type ItemForCheck,
} from '../application/elaboracao/inconsistency-checker';

function baseItem(overrides: Partial<ItemForCheck>): ItemForCheck {
  return {
    itemId: '00000000-0000-4000-8000-000000000001',
    procedimentoId: '100',
    procedimentoNome: 'Consulta',
    procedimentoGrupoGasto: 'PROCEDIMENTO',
    grupoGasto: 'PROCEDIMENTO',
    quantidade: 1,
    valorUnitario: 100,
    prestadorExecutanteId: '50',
    dataRealizacaoIso: '2026-04-15',
    autorizado: true,
    numeroAutorizacao: 'A1',
    foraPacote: false,
    pacoteId: null,
    lote: null,
    registroAnvisa: null,
    ...overrides,
  };
}

describe('checkInconsistencias', () => {
  it('ITEM_SEM_PRESTADOR para PROCEDIMENTO/HONORARIO sem prestador', () => {
    const result = checkInconsistencias({
      itens: [
        baseItem({ prestadorExecutanteId: null, grupoGasto: 'PROCEDIMENTO' }),
      ],
      pacotesNaConta: [],
      exigirAutorizacao: false,
    });
    expect(result).toContainEqual(
      expect.objectContaining({
        severidade: 'erro',
        codigo: 'ITEM_SEM_PRESTADOR',
      }),
    );
  });

  it('VALOR_ZERO (warning) para item não-honorário com valor 0', () => {
    const result = checkInconsistencias({
      itens: [
        baseItem({
          itemId: 'i-zero',
          valorUnitario: 0,
          grupoGasto: 'MATERIAL',
          procedimentoGrupoGasto: 'MATERIAL',
        }),
      ],
      pacotesNaConta: [],
      exigirAutorizacao: false,
    });
    expect(result).toContainEqual(
      expect.objectContaining({ severidade: 'warning', codigo: 'VALOR_ZERO' }),
    );
  });

  it('NÃO emite VALOR_ZERO para HONORARIO', () => {
    const result = checkInconsistencias({
      itens: [
        baseItem({
          itemId: 'i-hon',
          valorUnitario: 0,
          grupoGasto: 'HONORARIO',
          procedimentoGrupoGasto: 'HONORARIO',
        }),
      ],
      pacotesNaConta: [],
      exigirAutorizacao: false,
    });
    expect(
      result.find((r) => r.codigo === 'VALOR_ZERO'),
    ).toBeUndefined();
  });

  it('GRUPO_GASTO_MISMATCH quando item.grupo difere de procedimento.grupo', () => {
    const result = checkInconsistencias({
      itens: [
        baseItem({
          procedimentoGrupoGasto: 'PROCEDIMENTO',
          grupoGasto: 'TAXA',
          prestadorExecutanteId: '50', // não-procedure não exige prestador
        }),
      ],
      pacotesNaConta: [],
      exigirAutorizacao: false,
    });
    expect(result).toContainEqual(
      expect.objectContaining({
        severidade: 'warning',
        codigo: 'GRUPO_GASTO_MISMATCH',
      }),
    );
  });

  it('OPME_SEM_REGISTRO_ANVISA + OPME_SEM_LOTE', () => {
    const result = checkInconsistencias({
      itens: [
        baseItem({
          itemId: 'opme-1',
          grupoGasto: 'OPME',
          procedimentoGrupoGasto: 'OPME',
          registroAnvisa: null,
          lote: null,
        }),
      ],
      pacotesNaConta: [],
      exigirAutorizacao: false,
    });
    expect(result).toContainEqual(
      expect.objectContaining({ codigo: 'OPME_SEM_REGISTRO_ANVISA' }),
    );
    expect(result).toContainEqual(
      expect.objectContaining({ codigo: 'OPME_SEM_LOTE' }),
    );
  });

  it('ITEM_DUPLICADO quando proc + data + prestador iguais', () => {
    const result = checkInconsistencias({
      itens: [
        baseItem({ itemId: 'a' }),
        baseItem({ itemId: 'b' }),
      ],
      pacotesNaConta: [],
      exigirAutorizacao: false,
    });
    expect(
      result.filter((r) => r.codigo === 'ITEM_DUPLICADO'),
    ).toHaveLength(1);
  });

  it('NAO_AUTORIZADO emitido apenas quando exigirAutorizacao=true', () => {
    const item = baseItem({ autorizado: false, grupoGasto: 'PROCEDIMENTO' });
    const sem = checkInconsistencias({
      itens: [item],
      pacotesNaConta: [],
      exigirAutorizacao: false,
    });
    const com = checkInconsistencias({
      itens: [item],
      pacotesNaConta: [],
      exigirAutorizacao: true,
    });
    expect(sem.find((r) => r.codigo === 'NAO_AUTORIZADO')).toBeUndefined();
    expect(com).toContainEqual(
      expect.objectContaining({ severidade: 'erro', codigo: 'NAO_AUTORIZADO' }),
    );
  });

  it('PACOTE_INCOMPLETO quando faltam itens previstos', () => {
    const result = checkInconsistencias({
      itens: [
        baseItem({
          itemId: 'p1',
          procedimentoId: '500',
          pacoteId: '10',
          quantidade: 1,
        }),
      ],
      pacotesNaConta: [
        {
          pacoteId: '10',
          itensPrevistos: [
            { procedimentoId: 500n, quantidade: 1 },
            { procedimentoId: 600n, quantidade: 2 },
          ],
        },
      ],
      exigirAutorizacao: false,
    });
    expect(result).toContainEqual(
      expect.objectContaining({
        severidade: 'warning',
        codigo: 'PACOTE_INCOMPLETO',
      }),
    );
  });

  it('conta limpa: nenhuma inconsistência', () => {
    const result = checkInconsistencias({
      itens: [baseItem({})],
      pacotesNaConta: [],
      exigirAutorizacao: false,
    });
    expect(result).toEqual([]);
  });
});
