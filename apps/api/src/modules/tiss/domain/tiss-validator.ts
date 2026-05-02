/**
 * Validador TISS — versão simplificada (stub).
 *
 * STATUS: este módulo é uma validação **estrutural** que cobre as
 * regras semânticas mais comuns do padrão TISS (ANS) — campos
 * obrigatórios, somatório de itens, intervalo de datas. Ele NÃO
 * substitui a validação contra o **XSD oficial da ANS**, que é
 * obrigatória em produção (CLAUDE.md §7).
 *
 * Por que stub?
 *   - O XSD oficial muda a cada versão TISS (4.00.x, 4.01.x...) e
 *     contém milhares de elementos e atributos.
 *   - As bibliotecas Node de validação XSD (`xsd-schema-validator`,
 *     `libxmljs2`) dependem de Java/binários nativos e
 *     atrapalham CI/Docker.
 *   - A integração com o validador oficial está **deferida para a
 *     Fase 13 (Integrações)**, onde um microsserviço Go fará a
 *     validação contra o XSD homologado pela ANS.
 *
 * O que este validador cobre (versão TISS 4.00.00 / 4.01.00):
 *   - `<guia tipo=... versao=...>` raiz com atributos preenchidos.
 *   - Bloco `<prestador>` com `cnpj`, `nome`, `registroAns`.
 *   - Bloco `<beneficiario>` com `carteirinha` e `nome`.
 *   - Bloco `<itens>` com itens válidos (código, quantidade > 0,
 *     valor total >= 0).
 *   - Soma dos `valorTotal` dos itens == `<valor>`.
 *   - `dataAtendimento` <= `dataAlta` (quando aplicáveis).
 *
 * Cada erro é retornado como `{ campo, regra, valor, mensagem }` para
 * que a UI possa apontar exatamente onde corrigir.
 */
import type { GuiaTissTipo } from './guia-tiss';

export const VERSOES_TISS_SUPORTADAS = ['4.00.00', '4.01.00'] as const;
export type VersaoTiss = (typeof VERSOES_TISS_SUPORTADAS)[number];

export interface ValidacaoErro {
  campo: string;
  regra: string;
  valor?: string | number | null;
  mensagem: string;
}

export interface GuiaItemValidacao {
  codigo: string | null;
  codigoTabela?: string | null;
  quantidade: number | string;
  valorUnitario?: number | string;
  valorTotal: number | string;
}

export interface GuiaTissValidacaoInput {
  versao: string;
  tipo: GuiaTissTipo;
  numeroGuiaPrestador: string | null;
  prestador: {
    cnpj: string | null;
    nome: string | null;
    registroAns: string | null;
  };
  beneficiario: {
    carteirinha: string | null;
    nome: string | null;
  };
  convenio: {
    registroAns: string | null;
    nome: string | null;
  };
  itens: GuiaItemValidacao[];
  valorTotal: number | string;
  dataAtendimento?: string | null;
  dataAlta?: string | null;
}

export interface ValidacaoResultado {
  valido: boolean;
  erros: ValidacaoErro[];
  /** Versão TISS efetivamente usada na validação (ou indicação de erro). */
  versaoUsada: string;
}

const TOLERANCIA_VALOR = 0.005; // 1/2 centavo

function toNumber(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return Number.NaN;
  return typeof v === 'number' ? v : Number(v);
}

function isVersaoSuportada(v: string): v is VersaoTiss {
  return (VERSOES_TISS_SUPORTADAS as readonly string[]).includes(v);
}

/**
 * Valida o conjunto estruturado da guia. Devolve sempre um resultado;
 * cabe ao caller decidir se persiste como `ERRO` (mantém o XML para
 * que o operador corrija) ou bloqueia a operação.
 */
export function validateGuia(
  input: GuiaTissValidacaoInput,
): ValidacaoResultado {
  const erros: ValidacaoErro[] = [];

  // 1. Versão
  if (
    input.versao === undefined ||
    input.versao === null ||
    input.versao === ''
  ) {
    erros.push({
      campo: 'guia.versao',
      regra: 'OBRIGATORIO',
      mensagem: 'Versão TISS é obrigatória.',
    });
  } else if (!isVersaoSuportada(input.versao)) {
    erros.push({
      campo: 'guia.versao',
      regra: 'VERSAO_NAO_SUPORTADA',
      valor: input.versao,
      mensagem: `Versão TISS ${input.versao} não suportada. Suportadas: ${VERSOES_TISS_SUPORTADAS.join(', ')}.`,
    });
  }

  // 2. Tipo
  if (input.tipo === undefined || input.tipo === null) {
    erros.push({
      campo: 'guia.tipo',
      regra: 'OBRIGATORIO',
      mensagem: 'Tipo de guia é obrigatório.',
    });
  }

  // 3. Número da guia do prestador
  if (
    input.numeroGuiaPrestador === null ||
    input.numeroGuiaPrestador === undefined ||
    input.numeroGuiaPrestador.trim() === ''
  ) {
    erros.push({
      campo: 'guia.numeroGuiaPrestador',
      regra: 'OBRIGATORIO',
      mensagem: 'Número da guia do prestador é obrigatório.',
    });
  }

  // 4. Prestador
  if (
    !input.prestador ||
    !input.prestador.cnpj ||
    input.prestador.cnpj.trim() === ''
  ) {
    erros.push({
      campo: 'prestador.cnpj',
      regra: 'OBRIGATORIO',
      mensagem: 'CNPJ do prestador é obrigatório.',
    });
  }
  if (
    !input.prestador ||
    !input.prestador.nome ||
    input.prestador.nome.trim() === ''
  ) {
    erros.push({
      campo: 'prestador.nome',
      regra: 'OBRIGATORIO',
      mensagem: 'Nome do prestador é obrigatório.',
    });
  }
  if (
    !input.prestador ||
    !input.prestador.registroAns ||
    input.prestador.registroAns.trim() === ''
  ) {
    erros.push({
      campo: 'prestador.registroAns',
      regra: 'OBRIGATORIO',
      mensagem: 'Registro ANS do prestador é obrigatório.',
    });
  }

  // 5. Beneficiário
  if (
    !input.beneficiario ||
    !input.beneficiario.carteirinha ||
    input.beneficiario.carteirinha.trim() === ''
  ) {
    erros.push({
      campo: 'beneficiario.carteirinha',
      regra: 'OBRIGATORIO',
      mensagem: 'Carteirinha do beneficiário é obrigatória.',
    });
  }
  if (
    !input.beneficiario ||
    !input.beneficiario.nome ||
    input.beneficiario.nome.trim() === ''
  ) {
    erros.push({
      campo: 'beneficiario.nome',
      regra: 'OBRIGATORIO',
      mensagem: 'Nome do beneficiário é obrigatório.',
    });
  }

  // 6. Convênio
  if (
    !input.convenio ||
    !input.convenio.registroAns ||
    input.convenio.registroAns.trim() === ''
  ) {
    erros.push({
      campo: 'convenio.registroAns',
      regra: 'OBRIGATORIO',
      mensagem: 'Registro ANS do convênio é obrigatório.',
    });
  }

  // 7. Itens
  if (!Array.isArray(input.itens) || input.itens.length === 0) {
    erros.push({
      campo: 'itens',
      regra: 'MINIMO_UM_ITEM',
      mensagem: 'A guia precisa ter pelo menos um item.',
    });
  } else {
    let somaItens = 0;
    input.itens.forEach((item, idx) => {
      const path = `itens[${idx}]`;
      if (
        item.codigo === null ||
        item.codigo === undefined ||
        String(item.codigo).trim() === ''
      ) {
        erros.push({
          campo: `${path}.codigo`,
          regra: 'OBRIGATORIO',
          mensagem: `Item ${idx + 1}: código é obrigatório.`,
        });
      }
      const qtd = toNumber(item.quantidade);
      if (!Number.isFinite(qtd) || qtd <= 0) {
        erros.push({
          campo: `${path}.quantidade`,
          regra: 'QUANTIDADE_POSITIVA',
          valor: item.quantidade as string | number | null,
          mensagem: `Item ${idx + 1}: quantidade deve ser > 0.`,
        });
      }
      const vt = toNumber(item.valorTotal);
      if (!Number.isFinite(vt) || vt < 0) {
        erros.push({
          campo: `${path}.valorTotal`,
          regra: 'VALOR_TOTAL_NAO_NEGATIVO',
          valor: item.valorTotal as string | number | null,
          mensagem: `Item ${idx + 1}: valorTotal deve ser >= 0.`,
        });
      } else {
        somaItens += vt;
      }
    });

    // 8. Soma dos itens vs. valor total da guia
    const valorTotal = toNumber(input.valorTotal);
    if (!Number.isFinite(valorTotal) || valorTotal < 0) {
      erros.push({
        campo: 'valorTotal',
        regra: 'VALOR_TOTAL_NAO_NEGATIVO',
        valor: input.valorTotal as string | number,
        mensagem: 'valorTotal da guia deve ser >= 0.',
      });
    } else if (Math.abs(valorTotal - somaItens) > TOLERANCIA_VALOR) {
      erros.push({
        campo: 'valorTotal',
        regra: 'SOMA_ITENS_DIVERGE',
        valor: valorTotal,
        mensagem: `Soma dos itens (${somaItens.toFixed(4)}) difere do valorTotal da guia (${valorTotal.toFixed(4)}).`,
      });
    }
  }

  // 9. Datas
  if (
    input.dataAtendimento !== undefined &&
    input.dataAtendimento !== null &&
    input.dataAlta !== undefined &&
    input.dataAlta !== null
  ) {
    const ta = Date.parse(input.dataAtendimento);
    const tb = Date.parse(input.dataAlta);
    if (
      Number.isFinite(ta) &&
      Number.isFinite(tb) &&
      ta > tb
    ) {
      erros.push({
        campo: 'dataAtendimento',
        regra: 'DATA_ATENDIMENTO_APOS_ALTA',
        valor: input.dataAtendimento,
        mensagem: `dataAtendimento (${input.dataAtendimento}) é posterior a dataAlta (${input.dataAlta}).`,
      });
    }
  }

  return {
    valido: erros.length === 0,
    erros,
    versaoUsada: input.versao,
  };
}

export interface LoteValidacaoInput {
  versao: string;
  numeroLote: string | null;
  competencia: string | null;
  registroAnsConvenio: string | null;
  guias: GuiaTissValidacaoInput[];
  qtdGuias: number;
  valorTotal: number | string;
}

export function validateLote(
  input: LoteValidacaoInput,
): ValidacaoResultado {
  const erros: ValidacaoErro[] = [];

  if (
    input.versao === undefined ||
    input.versao === null ||
    input.versao === ''
  ) {
    erros.push({
      campo: 'lote.versao',
      regra: 'OBRIGATORIO',
      mensagem: 'Versão TISS do lote é obrigatória.',
    });
  } else if (!isVersaoSuportada(input.versao)) {
    erros.push({
      campo: 'lote.versao',
      regra: 'VERSAO_NAO_SUPORTADA',
      valor: input.versao,
      mensagem: `Versão TISS ${input.versao} não suportada.`,
    });
  }

  if (
    input.numeroLote === null ||
    input.numeroLote === undefined ||
    input.numeroLote.trim() === ''
  ) {
    erros.push({
      campo: 'lote.numero',
      regra: 'OBRIGATORIO',
      mensagem: 'Número do lote é obrigatório.',
    });
  }

  if (
    input.competencia === null ||
    input.competencia === undefined ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.competencia)
  ) {
    erros.push({
      campo: 'lote.competencia',
      regra: 'COMPETENCIA_INVALIDA',
      valor: input.competencia,
      mensagem: 'Competência precisa estar no formato AAAA-MM.',
    });
  }

  if (
    input.registroAnsConvenio === null ||
    input.registroAnsConvenio === undefined ||
    input.registroAnsConvenio.trim() === ''
  ) {
    erros.push({
      campo: 'lote.registroAnsConvenio',
      regra: 'OBRIGATORIO',
      mensagem: 'Registro ANS do convênio do lote é obrigatório.',
    });
  }

  if (!Array.isArray(input.guias) || input.guias.length === 0) {
    erros.push({
      campo: 'lote.guias',
      regra: 'MINIMO_UMA_GUIA',
      mensagem: 'O lote precisa conter pelo menos uma guia.',
    });
  } else {
    if (input.qtdGuias !== input.guias.length) {
      erros.push({
        campo: 'lote.qtdGuias',
        regra: 'QTD_GUIAS_DIVERGE',
        valor: input.qtdGuias,
        mensagem: `qtdGuias declarada (${input.qtdGuias}) difere do número real de guias (${input.guias.length}).`,
      });
    }

    let somaGuias = 0;
    input.guias.forEach((g, idx) => {
      const r = validateGuia(g);
      if (!r.valido) {
        for (const e of r.erros) {
          erros.push({
            campo: `lote.guias[${idx}].${e.campo}`,
            regra: e.regra,
            valor: e.valor,
            mensagem: `Guia #${idx + 1} (${g.numeroGuiaPrestador ?? '—'}): ${e.mensagem}`,
          });
        }
      }
      somaGuias += toNumber(g.valorTotal);
    });

    const valorTotal = toNumber(input.valorTotal);
    if (Number.isFinite(valorTotal) && Math.abs(valorTotal - somaGuias) > TOLERANCIA_VALOR) {
      erros.push({
        campo: 'lote.valorTotal',
        regra: 'SOMA_GUIAS_DIVERGE',
        valor: valorTotal,
        mensagem: `Soma das guias (${somaGuias.toFixed(4)}) difere do valorTotal do lote (${valorTotal.toFixed(4)}).`,
      });
    }
  }

  return {
    valido: erros.length === 0,
    erros,
    versaoUsada: input.versao,
  };
}
