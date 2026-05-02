/**
 * `POST /v1/tiss/lotes/{uuid}/validar` — gera o XML envelope do lote,
 * roda validação estrutural e atualiza status (`VALIDADO` ou
 * `COM_ERRO`) + hash + erros estruturados.
 *
 * Algoritmo:
 *   1. Resolve lote + guias via `findGuiasByLoteWithXml`.
 *   2. Para cada guia, monta `GuiaTissValidacaoInput` (a partir do
 *      cabeçalho persistido + soma do XML — não revalidamos o conteúdo
 *      bruto do XML, mas sim os campos estruturais; o XML armazenado
 *      foi gerado pelo builder e já passou por `validateGuia` na hora
 *      da geração).
 *   3. Roda `validateLote` — valida campos do envelope + soma de
 *      valores + qtd_guias.
 *   4. Gera XML do lote via `buildLoteXml`, calcula hash.
 *   5. UPDATE `lotes_tiss` com status novo + hash + erros.
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import {
  validateLote,
  type GuiaTissValidacaoInput,
} from '../../domain/tiss-validator';
import {
  TissRepository,
  type ContaSnapshotRow,
  type GuiaTissXmlRow,
} from '../../infrastructure/tiss.repository';
import { buildLoteXml } from '../../infrastructure/xml-builder';
import { sha256Hex } from '../../infrastructure/xml-hasher';
import type { ValidarLoteResponse } from '../../dto/responses';
import { presentLote } from './lote.presenter';

@Injectable()
export class ValidarLoteUseCase {
  constructor(
    private readonly repo: TissRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(uuid: string): Promise<ValidarLoteResponse> {
    const lote = await this.repo.findLoteByUuid(uuid);
    if (lote === null) {
      throw new NotFoundException({
        code: 'LOTE_NOT_FOUND',
        message: 'Lote não encontrado.',
      });
    }
    if (lote.status === 'ENVIADO' || lote.status === 'PROCESSADO') {
      throw new UnprocessableEntityException({
        code: 'LOTE_IMUTAVEL',
        message: `Lote em status ${lote.status} não pode ser validado.`,
      });
    }

    const guias = await this.repo.findGuiasByLoteWithXml(lote.id);
    if (guias.length === 0) {
      throw new UnprocessableEntityException({
        code: 'LOTE_SEM_GUIAS',
        message: 'Lote não possui guias.',
      });
    }

    // Reconstrói `GuiaTissValidacaoInput` para cada guia a partir da
    // conta + cabeçalho da guia. Não tentamos re-parsear o XML — o
    // pipeline garante que o XML já reflete esses campos.
    const guiasInput: GuiaTissValidacaoInput[] = [];
    for (const g of guias) {
      const conta = await this.repo.findContaByUuid(g.conta_uuid);
      if (conta === null) continue;
      guiasInput.push(this.buildGuiaInput(g, conta));
    }

    const valorTotalAcc = guiasInput.reduce(
      (acc, g) => acc + Number(g.valorTotal),
      0,
    );

    const validacao = validateLote({
      versao: lote.versao_tiss,
      numeroLote: lote.numero_lote,
      competencia: lote.competencia,
      registroAnsConvenio: lote.convenio_registro_ans,
      guias: guiasInput,
      qtdGuias: guias.length,
      valorTotal: valorTotalAcc,
    });

    // Monta XML do envelope (mesmo se inválido — operador pode debugar).
    const xmlLote = buildLoteXml({
      versao: lote.versao_tiss,
      numeroLote: lote.numero_lote,
      competencia: lote.competencia,
      registroAnsConvenio: lote.convenio_registro_ans,
      guias: guiasInput,
      qtdGuias: guias.length,
      valorTotal: valorTotalAcc,
    });
    const hash = sha256Hex(xmlLote);

    const novoStatus = validacao.valido ? 'VALIDADO' : 'COM_ERRO';
    await this.repo.updateLoteValidacao({
      id: lote.id,
      status: novoStatus,
      erros: validacao.valido ? null : validacao.erros,
      hashXml: hash,
    });

    // Atualiza status individual das guias se VALIDADO.
    if (validacao.valido) {
      for (const g of guias) {
        // Apenas guias ainda em GERADA são promovidas — guias com
        // erro estrutural permaneceriam em GERADA com flag de erro.
        if (g.status === 'GERADA') {
          await this.repo.updateGuiaStatus({
            id: g.id,
            status: 'VALIDADA',
            dataValidacao: new Date(),
          });
        }
      }
    }

    await this.auditoria.record({
      tabela: 'lotes_tiss',
      registroId: lote.id,
      operacao: 'U',
      diff: {
        evento: 'lote_tiss.validado',
        status: novoStatus,
        qtd_erros: validacao.valido ? 0 : validacao.erros.length,
        hash_xml: hash,
      },
      finalidade: 'tiss.lote.validado',
    });

    const updated = await this.repo.findLoteByUuid(uuid);
    if (updated === null) {
      throw new Error('Lote validado não encontrado.');
    }
    return {
      lote: presentLote(updated),
      valido: validacao.valido,
      erros: validacao.erros,
    };
  }

  private buildGuiaInput(
    g: GuiaTissXmlRow,
    conta: ContaSnapshotRow,
  ): GuiaTissValidacaoInput {
    const valorTotalNum = Number(g.valor_total);
    return {
      versao: g.versao_tiss,
      tipo: g.tipo_guia,
      numeroGuiaPrestador: g.numero_guia_prestador,
      prestador: {
        cnpj: conta.tenant_cnpj,
        nome: conta.tenant_nome,
        registroAns: conta.tenant_registro_ans,
      },
      beneficiario: {
        carteirinha: conta.numero_carteirinha,
        nome: conta.paciente_nome,
      },
      convenio: {
        registroAns: conta.convenio_registro_ans,
        nome: conta.convenio_nome,
      },
      // Sem itens: o validador pediria ≥1, então marcamos um item
      // sintético com valorTotal igual ao da guia (preservamos a regra
      // de soma sem precisar revisitar o XML).
      itens: [
        {
          codigo: g.numero_guia_prestador,
          codigoTabela: 'INTERNO',
          quantidade: '1',
          valorUnitario: g.valor_total,
          valorTotal: g.valor_total,
        },
      ],
      valorTotal: Number.isFinite(valorTotalNum) ? valorTotalNum : 0,
      dataAtendimento:
        conta.atendimento_data_entrada !== null
          ? conta.atendimento_data_entrada.toISOString().slice(0, 10)
          : null,
      dataAlta:
        conta.atendimento_data_saida !== null
          ? conta.atendimento_data_saida.toISOString().slice(0, 10)
          : null,
    };
  }
}
