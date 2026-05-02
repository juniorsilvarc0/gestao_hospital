/**
 * Helper compartilhado pelos builders.
 *
 * Centraliza o pipeline:
 *   1. monta o input estruturado (`GuiaTissValidacaoInput`)
 *   2. chama `buildGuiaXml` (`xml-builder`)
 *   3. chama `validateGuia` (`tiss-validator`)
 *   4. calcula o hash SHA-256 (`xml-hasher`)
 *
 * Cada builder específico (`consulta`, `sp-sadt`, ...) só precisa
 * decidir QUAIS itens entram, montar a função de "tweak" que adiciona
 * dados específicos do tipo (ex.: `<funcao>` em HONORARIOS) e chamar
 * `buildAndValidate`.
 */
import type {
  GuiaTissTipo,
  ValidacaoXsdStatus,
} from '../../../domain/guia-tiss';
import type {
  GuiaItemValidacao,
  GuiaTissValidacaoInput,
  ValidacaoErro,
} from '../../../domain/tiss-validator';
import { validateGuia } from '../../../domain/tiss-validator';
import { buildGuiaXml } from '../../../infrastructure/xml-builder';
import { sha256Hex } from '../../../infrastructure/xml-hasher';
import type { BuilderContext, BuilderResult } from './builder-context';
import { isoDate, itensToValidatorInput, somarItens } from './builder-context';

export function buildAndValidate(args: {
  tipo: GuiaTissTipo;
  ctx: BuilderContext;
  itens: GuiaItemValidacao[];
  itensIds: bigint[];
  valorTotal: string;
  /** Permite ao builder injetar dados extras (ex.: `<funcao>` por item). */
  extra?: Partial<GuiaTissValidacaoInput>;
}): BuilderResult {
  const { ctx } = args;

  const valorTotalNum = Number(args.valorTotal);
  const input: GuiaTissValidacaoInput = {
    versao: ctx.versaoTiss,
    tipo: args.tipo,
    numeroGuiaPrestador: ctx.numeroGuiaPrestador,
    prestador: {
      cnpj: ctx.conta.tenant_cnpj,
      nome: ctx.conta.tenant_nome,
      registroAns: ctx.conta.tenant_registro_ans,
    },
    beneficiario: {
      carteirinha: ctx.conta.numero_carteirinha,
      nome: ctx.conta.paciente_nome,
    },
    convenio: {
      registroAns: ctx.conta.convenio_registro_ans,
      nome: ctx.conta.convenio_nome,
    },
    itens: args.itens,
    valorTotal: Number.isFinite(valorTotalNum) ? valorTotalNum : 0,
    dataAtendimento: isoDate(ctx.conta.atendimento_data_entrada),
    dataAlta: isoDate(ctx.conta.atendimento_data_saida),
    ...(args.extra ?? {}),
  };

  const xml = buildGuiaXml(input);
  const validacao = validateGuia(input);

  const validacaoStatus: ValidacaoXsdStatus = validacao.valido ? 'OK' : 'ERRO';
  const validacaoErros: ValidacaoErro[] | null = validacao.valido
    ? null
    : validacao.erros;

  return {
    tipo: args.tipo,
    xml,
    hashXml: sha256Hex(xml),
    valorTotal: args.valorTotal,
    validacaoStatus,
    validacaoErros,
    itensIds: args.itensIds,
  };
}

/** Re-exporta utilitários para conveniência. */
export { isoDate, itensToValidatorInput, somarItens };
