/**
 * Wrapper sobre `xmlbuilder2` para gerar XML TISS de guias e lotes.
 *
 * Esta é uma implementação **simplificada** que cobre os campos
 * essenciais do padrão TISS (ANS) — prestador, beneficiário, convênio,
 * itens e valores. Não substitui o XML completo do padrão TISS 4.x
 * oficial; ver TODO no `tiss-validator.ts` para a Fase 13.
 *
 * Convenções:
 *   - Tags em camelCase semelhante ao padrão TISS oficial
 *     (ex.: `<guiaSpSadt>`, `<dadosBeneficiario>`).
 *   - Decimais formatados com 2 casas (`toFixed(2)`) para valores
 *     monetários — cabe a quem chama enviar `Decimal`/`number` correto.
 *   - Datas em ISO yyyy-mm-dd (sem hora) para `dataAtendimento`/`dataAlta`.
 */
import { create } from 'xmlbuilder2';
import type { XMLBuilder } from 'xmlbuilder2/lib/interfaces';

import type {
  GuiaTissValidacaoInput,
  LoteValidacaoInput,
} from '../domain/tiss-validator';

function fmtMoney(v: number | string): string {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

function fmtQty(v: number | string): string {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return '0';
  return n.toString();
}

function dateOnly(s: string | null | undefined): string | null {
  if (s === null || s === undefined || s === '') return null;
  // Remove parte de tempo se vier ISO completo.
  return s.length >= 10 ? s.slice(0, 10) : s;
}

/**
 * Gera o XML TISS de uma guia. Devolve string (UTF-8) já com prólogo.
 */
export function buildGuiaXml(input: GuiaTissValidacaoInput): string {
  const root = create({ version: '1.0', encoding: 'UTF-8' }).ele('guia', {
    tipo: input.tipo,
    versao: input.versao,
  });

  root
    .ele('numeroGuiaPrestador')
    .txt(input.numeroGuiaPrestador ?? '')
    .up();

  // Prestador
  const prestador = root.ele('prestador');
  prestador.ele('cnpj').txt(input.prestador.cnpj ?? '').up();
  prestador.ele('nome').txt(input.prestador.nome ?? '').up();
  prestador
    .ele('registroAns')
    .txt(input.prestador.registroAns ?? '')
    .up();
  prestador.up();

  // Convênio
  const convenio = root.ele('convenio');
  convenio
    .ele('registroAns')
    .txt(input.convenio.registroAns ?? '')
    .up();
  convenio.ele('nome').txt(input.convenio.nome ?? '').up();
  convenio.up();

  // Beneficiário
  const benef = root.ele('beneficiario');
  benef
    .ele('carteirinha')
    .txt(input.beneficiario.carteirinha ?? '')
    .up();
  benef.ele('nome').txt(input.beneficiario.nome ?? '').up();
  benef.up();

  // Datas
  const dAtend = dateOnly(input.dataAtendimento);
  if (dAtend !== null) {
    root.ele('dataAtendimento').txt(dAtend).up();
  }
  const dAlta = dateOnly(input.dataAlta);
  if (dAlta !== null) {
    root.ele('dataAlta').txt(dAlta).up();
  }

  // Itens
  const itens = root.ele('itens');
  for (const it of input.itens) {
    const itemEle = itens.ele('item');
    itemEle.ele('codigo').txt(it.codigo ?? '').up();
    if (
      it.codigoTabela !== null &&
      it.codigoTabela !== undefined &&
      it.codigoTabela !== ''
    ) {
      itemEle.ele('codigoTabela').txt(it.codigoTabela).up();
    }
    itemEle.ele('quantidade').txt(fmtQty(it.quantidade)).up();
    if (it.valorUnitario !== undefined) {
      itemEle.ele('valorUnitario').txt(fmtMoney(it.valorUnitario)).up();
    }
    itemEle.ele('valorTotal').txt(fmtMoney(it.valorTotal)).up();
    itemEle.up();
  }
  itens.up();

  root.ele('valorTotal').txt(fmtMoney(input.valorTotal)).up();

  return root.end({ prettyPrint: true, indent: '  ' });
}

/**
 * Gera o XML TISS do lote (envoltório `<lote>` contendo as `<guia>`).
 *
 * Estratégia: re-utiliza `buildGuiaXml` mas remove o prólogo das guias
 * filhas para compor um único documento. Mantemos a forma simples —
 * tipo "wrapper" — para que a validação saiba reabrir cada guia.
 */
export function buildLoteXml(input: LoteValidacaoInput): string {
  const root = create({ version: '1.0', encoding: 'UTF-8' }).ele('lote', {
    versao: input.versao,
  });

  root.ele('numero').txt(input.numeroLote ?? '').up();
  root.ele('competencia').txt(input.competencia ?? '').up();
  root
    .ele('registroAnsConvenio')
    .txt(input.registroAnsConvenio ?? '')
    .up();
  root.ele('qtdGuias').txt(String(input.qtdGuias)).up();
  root.ele('valorTotal').txt(fmtMoney(input.valorTotal)).up();

  const guiasEle = root.ele('guias');
  for (const g of input.guias) {
    appendGuiaToBuilder(guiasEle, g);
  }
  guiasEle.up();

  return root.end({ prettyPrint: true, indent: '  ' });
}

function appendGuiaToBuilder(
  parent: XMLBuilder,
  input: GuiaTissValidacaoInput,
): void {
  const g = parent.ele('guia', {
    tipo: input.tipo,
    versao: input.versao,
  });
  g
    .ele('numeroGuiaPrestador')
    .txt(input.numeroGuiaPrestador ?? '')
    .up();
  const prestador = g.ele('prestador');
  prestador.ele('cnpj').txt(input.prestador.cnpj ?? '').up();
  prestador.ele('nome').txt(input.prestador.nome ?? '').up();
  prestador
    .ele('registroAns')
    .txt(input.prestador.registroAns ?? '')
    .up();
  prestador.up();
  const conv = g.ele('convenio');
  conv
    .ele('registroAns')
    .txt(input.convenio.registroAns ?? '')
    .up();
  conv.ele('nome').txt(input.convenio.nome ?? '').up();
  conv.up();
  const benef = g.ele('beneficiario');
  benef
    .ele('carteirinha')
    .txt(input.beneficiario.carteirinha ?? '')
    .up();
  benef.ele('nome').txt(input.beneficiario.nome ?? '').up();
  benef.up();
  const dAtend = dateOnly(input.dataAtendimento);
  if (dAtend !== null) g.ele('dataAtendimento').txt(dAtend).up();
  const dAlta = dateOnly(input.dataAlta);
  if (dAlta !== null) g.ele('dataAlta').txt(dAlta).up();
  const itens = g.ele('itens');
  for (const it of input.itens) {
    const itemEle = itens.ele('item');
    itemEle.ele('codigo').txt(it.codigo ?? '').up();
    if (
      it.codigoTabela !== null &&
      it.codigoTabela !== undefined &&
      it.codigoTabela !== ''
    ) {
      itemEle.ele('codigoTabela').txt(it.codigoTabela).up();
    }
    itemEle.ele('quantidade').txt(fmtQty(it.quantidade)).up();
    if (it.valorUnitario !== undefined) {
      itemEle.ele('valorUnitario').txt(fmtMoney(it.valorUnitario)).up();
    }
    itemEle.ele('valorTotal').txt(fmtMoney(it.valorTotal)).up();
    itemEle.up();
  }
  itens.up();
  g.ele('valorTotal').txt(fmtMoney(input.valorTotal)).up();
  g.up();
}
