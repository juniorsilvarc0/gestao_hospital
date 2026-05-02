/**
 * Testes do validador estrutural TISS.
 *
 * Cobertura:
 *   - Campos obrigatórios (versao, prestador, beneficiario, convenio, itens).
 *   - Soma dos itens vs. valorTotal da guia.
 *   - dataAtendimento posterior à dataAlta.
 *   - Validação de lote (envelope) com qtd_guias e soma de valores.
 */
import { describe, expect, it } from 'vitest';

import {
  validateGuia,
  validateLote,
  type GuiaTissValidacaoInput,
  type LoteValidacaoInput,
} from '../domain/tiss-validator';

function baseGuia(): GuiaTissValidacaoInput {
  return {
    versao: '4.01.00',
    tipo: 'SP_SADT',
    numeroGuiaPrestador: 'G-001',
    prestador: {
      cnpj: '12.345.678/0001-99',
      nome: 'Hospital Teste',
      registroAns: '123456',
    },
    beneficiario: {
      carteirinha: '0001234567',
      nome: 'João da Silva',
    },
    convenio: {
      registroAns: '987654',
      nome: 'Convênio Teste',
    },
    itens: [
      {
        codigo: '10101012',
        codigoTabela: 'TUSS',
        quantidade: 1,
        valorUnitario: 100,
        valorTotal: 100,
      },
    ],
    valorTotal: 100,
    dataAtendimento: '2026-04-30',
    dataAlta: '2026-05-01',
  };
}

describe('validateGuia', () => {
  it('valida guia mínima OK', () => {
    const r = validateGuia(baseGuia());
    expect(r.valido).toBe(true);
    expect(r.erros).toHaveLength(0);
  });

  it('rejeita versão TISS não suportada', () => {
    const g = baseGuia();
    g.versao = '3.00.00';
    const r = validateGuia(g);
    expect(r.valido).toBe(false);
    expect(r.erros.some((e) => e.regra === 'VERSAO_NAO_SUPORTADA')).toBe(true);
  });

  it('rejeita item sem código', () => {
    const g = baseGuia();
    g.itens = [
      {
        codigo: null,
        quantidade: 1,
        valorUnitario: 100,
        valorTotal: 100,
      },
    ];
    const r = validateGuia(g);
    expect(r.valido).toBe(false);
    const erro = r.erros.find((e) => e.campo === 'itens[0].codigo');
    expect(erro).toBeDefined();
    expect(erro?.regra).toBe('OBRIGATORIO');
  });

  it('rejeita quantidade <= 0', () => {
    const g = baseGuia();
    g.itens[0].quantidade = 0;
    const r = validateGuia(g);
    expect(r.valido).toBe(false);
    expect(r.erros.some((e) => e.regra === 'QUANTIDADE_POSITIVA')).toBe(true);
  });

  it('rejeita soma de itens divergente do valorTotal', () => {
    const g = baseGuia();
    g.itens[0].valorTotal = 50; // soma 50 vs. valorTotal 100
    const r = validateGuia(g);
    expect(r.valido).toBe(false);
    expect(r.erros.some((e) => e.regra === 'SOMA_ITENS_DIVERGE')).toBe(true);
  });

  it('rejeita dataAtendimento posterior a dataAlta', () => {
    const g = baseGuia();
    g.dataAtendimento = '2026-05-02';
    g.dataAlta = '2026-05-01';
    const r = validateGuia(g);
    expect(r.valido).toBe(false);
    expect(
      r.erros.some((e) => e.regra === 'DATA_ATENDIMENTO_APOS_ALTA'),
    ).toBe(true);
  });

  it('exige carteirinha do beneficiário', () => {
    const g = baseGuia();
    g.beneficiario.carteirinha = null;
    const r = validateGuia(g);
    expect(r.valido).toBe(false);
    expect(r.erros.some((e) => e.campo === 'beneficiario.carteirinha')).toBe(
      true,
    );
  });

  it('exige ao menos um item', () => {
    const g = baseGuia();
    g.itens = [];
    g.valorTotal = 0;
    const r = validateGuia(g);
    expect(r.valido).toBe(false);
    expect(r.erros.some((e) => e.regra === 'MINIMO_UM_ITEM')).toBe(true);
  });
});

describe('validateLote', () => {
  function baseLote(): LoteValidacaoInput {
    return {
      versao: '4.01.00',
      numeroLote: '0001',
      competencia: '2026-04',
      registroAnsConvenio: '987654',
      guias: [baseGuia()],
      qtdGuias: 1,
      valorTotal: 100,
    };
  }

  it('valida lote mínimo', () => {
    const r = validateLote(baseLote());
    expect(r.valido).toBe(true);
    expect(r.erros).toHaveLength(0);
  });

  it('rejeita competência fora do formato AAAA-MM', () => {
    const l = baseLote();
    l.competencia = '04/2026';
    const r = validateLote(l);
    expect(r.valido).toBe(false);
    expect(r.erros.some((e) => e.regra === 'COMPETENCIA_INVALIDA')).toBe(true);
  });

  it('rejeita qtdGuias divergente', () => {
    const l = baseLote();
    l.qtdGuias = 5; // mas só tem 1 guia
    const r = validateLote(l);
    expect(r.valido).toBe(false);
    expect(r.erros.some((e) => e.regra === 'QTD_GUIAS_DIVERGE')).toBe(true);
  });

  it('rejeita soma das guias divergente do valorTotal do lote', () => {
    const l = baseLote();
    l.valorTotal = 999;
    const r = validateLote(l);
    expect(r.valido).toBe(false);
    expect(r.erros.some((e) => e.regra === 'SOMA_GUIAS_DIVERGE')).toBe(true);
  });

  it('propaga erros da guia para o lote', () => {
    const l = baseLote();
    l.guias[0].itens[0].codigo = null;
    const r = validateLote(l);
    expect(r.valido).toBe(false);
    expect(
      r.erros.some((e) => e.campo.startsWith('lote.guias[0].')),
    ).toBe(true);
  });
});
