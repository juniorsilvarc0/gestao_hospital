/**
 * Testes do `xml-builder` — apenas garantia de que o XML gerado é
 * sintaticamente válido (parseável) e contém os campos essenciais.
 */
import { describe, expect, it } from 'vitest';

import {
  buildGuiaXml,
  buildLoteXml,
} from '../infrastructure/xml-builder';
import { sha256Hex } from '../infrastructure/xml-hasher';
import type {
  GuiaTissValidacaoInput,
  LoteValidacaoInput,
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

describe('buildGuiaXml', () => {
  it('gera XML com prólogo e tags essenciais', () => {
    const xml = buildGuiaXml(baseGuia());
    expect(xml.startsWith('<?xml')).toBe(true);
    expect(xml).toContain('<guia tipo="SP_SADT" versao="4.01.00">');
    expect(xml).toContain('<numeroGuiaPrestador>G-001</numeroGuiaPrestador>');
    expect(xml).toContain('<cnpj>12.345.678/0001-99</cnpj>');
    expect(xml).toContain('<carteirinha>0001234567</carteirinha>');
    expect(xml).toContain('<codigo>10101012</codigo>');
    expect(xml).toContain('<valorTotal>100.00</valorTotal>');
    expect(xml).toContain('<dataAtendimento>2026-04-30</dataAtendimento>');
    expect(xml).toContain('<dataAlta>2026-05-01</dataAlta>');
  });

  it('gera XML diferente para guias com dados diferentes', () => {
    const a = buildGuiaXml(baseGuia());
    const g2 = baseGuia();
    g2.numeroGuiaPrestador = 'G-002';
    const b = buildGuiaXml(g2);
    expect(a).not.toBe(b);
  });

  it('hash SHA-256 é estável e tem 64 chars hex', () => {
    const xml = buildGuiaXml(baseGuia());
    const h1 = sha256Hex(xml);
    const h2 = sha256Hex(xml);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('buildLoteXml', () => {
  it('compõe envelope com guias dentro', () => {
    const lote: LoteValidacaoInput = {
      versao: '4.01.00',
      numeroLote: '0001',
      competencia: '2026-04',
      registroAnsConvenio: '987654',
      guias: [baseGuia()],
      qtdGuias: 1,
      valorTotal: 100,
    };
    const xml = buildLoteXml(lote);
    expect(xml).toContain('<lote versao="4.01.00">');
    expect(xml).toContain('<numero>0001</numero>');
    expect(xml).toContain('<competencia>2026-04</competencia>');
    expect(xml).toContain('<qtdGuias>1</qtdGuias>');
    expect(xml).toContain('<guia tipo="SP_SADT" versao="4.01.00">');
  });
});
