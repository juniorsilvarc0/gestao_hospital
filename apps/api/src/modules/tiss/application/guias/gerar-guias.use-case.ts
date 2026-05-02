/**
 * `POST /v1/tiss/guias/gerar` — gera guias TISS para uma conta.
 *
 * Algoritmo:
 *   1. Resolve conta + snapshots (paciente, convênio, plano, atendimento,
 *      tenant). Conta sem `convenio_id` rejeita (TISS é para convênio).
 *   2. Decide a versão TISS (snapshot da conta > convênio.versao_tiss).
 *      A versão precisa estar em `VERSOES_TISS_SUPORTADAS` — caso
 *      contrário, falha cedo com erro estruturado.
 *   3. Para cada `tipo` solicitado (default: todos):
 *      - busca itens compatíveis em `contas_itens` (não vinculados a
 *        outra guia)
 *      - chama o builder específico, recebe XML + hash + erros
 *      - INSERT `guias_tiss` com `validacao_xsd_status='OK'|'ERRO'` e
 *        `validacao_xsd_erros` populado quando houver
 *      - `UPDATE contas_itens SET guia_tiss_id=...` para amarrar os
 *        itens à guia (não vale para RESUMO_INTERNACAO, que é sintético)
 *   4. Audita evento `guia_tiss.gerada` por guia.
 *   5. Emite evento `tiss.guia.gerada` (consumido por outros contextos
 *      no futuro — Repasse, BI etc.).
 *
 * O uso de `numeroGuiaPrestador` aqui é determinístico —
 * `<numero_conta>-<TIPO_ABREV>-<seq>` para evitar colisão com a UNIQUE
 * `(tenant_id, numero_guia_prestador)`. Em produção, o operador pode
 * editar antes do envio ao convênio.
 *
 * IMPORTANTE: a guia é PERSISTIDA mesmo se a validação falhar
 * (`status='GERADA'`, `validacao_xsd_status='ERRO'`). O operador
 * corrige o item ofensor e clica "Regenerar". Isso é proposital
 * (CLAUDE.md §7 #4 — erros estruturados, operador entende e corrige).
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { GuiaTissTipo } from '../../domain/guia-tiss';
import { GUIA_TISS_TIPOS } from '../../domain/guia-tiss';
import { VERSOES_TISS_SUPORTADAS } from '../../domain/tiss-validator';
import {
  TissRepository,
  type ContaSnapshotRow,
} from '../../infrastructure/tiss.repository';
import type { GerarGuiasDto } from '../../dto/gerar-guias.dto';
import type { GerarGuiasResponse, GuiaResponse } from '../../dto/responses';
import { presentGuia } from './guia.presenter';
import type { BuilderContext, BuilderResult } from './builders/builder-context';
import { buildAnexoOpme } from './builders/anexo-opme.builder';
import { buildConsulta } from './builders/consulta.builder';
import { buildHonorarios } from './builders/honorarios.builder';
import { buildInternacao } from './builders/internacao.builder';
import { buildOutrasDespesas } from './builders/outras-despesas.builder';
import { buildResumoInternacao } from './builders/resumo-internacao.builder';
import { buildSpSadt } from './builders/sp-sadt.builder';

type Builder = (ctx: BuilderContext) => BuilderResult | null;

const BUILDERS: Record<GuiaTissTipo, Builder> = {
  CONSULTA: buildConsulta,
  SP_SADT: buildSpSadt,
  INTERNACAO: buildInternacao,
  HONORARIOS: buildHonorarios,
  OUTRAS_DESPESAS: buildOutrasDespesas,
  RESUMO_INTERNACAO: buildResumoInternacao,
  ANEXO_OPME: buildAnexoOpme,
};

const TIPO_ABREV: Record<GuiaTissTipo, string> = {
  CONSULTA: 'CON',
  SP_SADT: 'SAD',
  INTERNACAO: 'INT',
  HONORARIOS: 'HON',
  OUTRAS_DESPESAS: 'ODP',
  RESUMO_INTERNACAO: 'RES',
  ANEXO_OPME: 'OPM',
};

/**
 * Grupos de gasto buscados em `contas_itens` para cada tipo. Mantém
 * a query do repositório enxuta (LIKE não, ANY com array exato).
 */
const GRUPOS_POR_TIPO: Record<GuiaTissTipo, string[]> = {
  CONSULTA: ['PROCEDIMENTO'],
  SP_SADT: ['PROCEDIMENTO'],
  INTERNACAO: ['DIARIA', 'TAXA'],
  HONORARIOS: ['HONORARIO'],
  OUTRAS_DESPESAS: ['MATERIAL', 'MEDICAMENTO', 'GAS'],
  // RESUMO_INTERNACAO usa todos os grupos (é agregado).
  RESUMO_INTERNACAO: [
    'PROCEDIMENTO',
    'DIARIA',
    'TAXA',
    'SERVICO',
    'MATERIAL',
    'MEDICAMENTO',
    'OPME',
    'GAS',
    'PACOTE',
    'HONORARIO',
  ],
  ANEXO_OPME: ['OPME'],
};

@Injectable()
export class GerarGuiasUseCase {
  constructor(
    private readonly repo: TissRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(dto: GerarGuiasDto): Promise<GerarGuiasResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('GerarGuiasUseCase requires request context.');
    }

    const conta = await this.repo.findContaByUuid(dto.contaUuid);
    if (conta === null) {
      throw new NotFoundException({
        code: 'CONTA_NOT_FOUND',
        message: 'Conta não encontrada.',
      });
    }
    if (conta.convenio_id === null) {
      throw new UnprocessableEntityException({
        code: 'CONTA_SEM_CONVENIO',
        message:
          'Geração de guia TISS exige conta com convênio (PARTICULAR/SUS não usam TISS).',
      });
    }

    // Versão TISS efetiva: snapshot > convênio atual.
    let versaoTiss = conta.versao_tiss_snapshot;
    if (versaoTiss === null || versaoTiss === '') {
      versaoTiss =
        conta.convenio_versao_tiss ??
        (await this.repo.findVersaoTissByConvenio(conta.convenio_id));
    }
    if (versaoTiss === null || versaoTiss === '') {
      throw new UnprocessableEntityException({
        code: 'VERSAO_TISS_INDEFINIDA',
        message:
          'Não foi possível determinar a versão TISS da conta nem do convênio.',
      });
    }
    if (
      !(VERSOES_TISS_SUPORTADAS as readonly string[]).includes(versaoTiss)
    ) {
      throw new UnprocessableEntityException({
        code: 'VERSAO_TISS_NAO_SUPORTADA',
        message: `Versão TISS ${versaoTiss} não suportada. Suportadas: ${VERSOES_TISS_SUPORTADAS.join(', ')}.`,
      });
    }

    const tipos: GuiaTissTipo[] =
      dto.tipos !== undefined && dto.tipos.length > 0
        ? dto.tipos
        : ([...GUIA_TISS_TIPOS] as GuiaTissTipo[]);

    const guiasGeradas: GuiaResponse[] = [];
    const tiposIgnorados: GuiaTissTipo[] = [];

    let seq = 1;
    for (const tipo of tipos) {
      const itens = await this.repo.findContaItensByConta({
        contaId: conta.id,
        grupos: GRUPOS_POR_TIPO[tipo],
      });

      const builderCtx: BuilderContext = {
        conta,
        itens,
        versaoTiss,
        numeroGuiaPrestador: this.gerarNumeroGuia(conta, tipo, seq),
      };

      const builder = BUILDERS[tipo];
      const result = builder(builderCtx);
      if (result === null) {
        tiposIgnorados.push(tipo);
        continue;
      }

      const inserted = await this.repo.insertGuia({
        tenantId: ctx.tenantId,
        contaId: conta.id,
        tipo: result.tipo,
        versaoTiss,
        numeroGuiaPrestador: builderCtx.numeroGuiaPrestador,
        numeroGuiaOperadora: conta.numero_guia_operadora,
        senhaAutorizacao: conta.senha_autorizacao,
        xmlConteudo: result.xml,
        hashXml: result.hashXml,
        valorTotal: result.valorTotal,
        validacaoStatus: result.validacaoStatus,
        validacaoErros: result.validacaoErros,
        userId: ctx.userId,
      });

      // Vincula itens à guia (não vale para RESUMO_INTERNACAO).
      if (result.itensIds.length > 0) {
        await this.repo.attachItensToGuia(inserted.id, result.itensIds);
      }

      await this.auditoria.record({
        tabela: 'guias_tiss',
        registroId: inserted.id,
        operacao: 'I',
        diff: {
          evento: 'guia_tiss.gerada',
          conta_id: conta.id.toString(),
          tipo,
          versao_tiss: versaoTiss,
          valor_total: result.valorTotal,
          validacao_status: result.validacaoStatus,
          numero_guia_prestador: builderCtx.numeroGuiaPrestador,
        },
        finalidade: 'tiss.guia.gerada',
      });

      this.events.emit('tiss.guia.gerada', {
        guiaUuid: inserted.uuidExterno,
        contaUuid: dto.contaUuid,
        tipo,
        validacaoStatus: result.validacaoStatus,
      });

      const row = await this.repo.findGuiaByUuid(inserted.uuidExterno);
      if (row !== null) {
        guiasGeradas.push(presentGuia(row));
      }
      seq += 1;
    }

    return {
      contaUuid: dto.contaUuid,
      guias: guiasGeradas,
      tiposIgnorados,
    };
  }

  /**
   * Número da guia do prestador. Limitado a 30 chars (coluna VARCHAR(30)).
   * Formato: `<numero_conta-truncado>-<TIPO_ABREV>-<seq3>`.
   */
  private gerarNumeroGuia(
    conta: ContaSnapshotRow,
    tipo: GuiaTissTipo,
    seq: number,
  ): string {
    const abrev = TIPO_ABREV[tipo];
    const seqStr = String(seq).padStart(3, '0');
    // 30 - 1 ('-') - len(abrev) - 1 ('-') - 3 (seq) = 22 chars max p/ numero_conta
    const max = 30 - 1 - abrev.length - 1 - seqStr.length;
    const num =
      conta.numero_conta.length <= max
        ? conta.numero_conta
        : conta.numero_conta.slice(0, max);
    return `${num}-${abrev}-${seqStr}`;
  }
}
