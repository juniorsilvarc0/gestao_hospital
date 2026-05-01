/**
 * `POST /v1/evolucoes/:uuid/retificar` — cria nova versão (RN-PEP-03).
 *
 * Fluxo:
 *   1. Carrega evolução original. Deve estar assinada (caso contrário,
 *      basta editar o rascunho — 422).
 *   2. Sanitiza novo conteúdo TipTap.
 *   3. INSERT nova evolução tipo `RETIFICACAO` com `versao_anterior_id`
 *      apontando para a original. A original permanece imutável (a
 *      trigger DB já bloqueia qualquer UPDATE/DELETE).
 *   4. Audit `evolucao.retificada` em AMBAS:
 *      - na original (operacao=U lógica) com `evolucao_nova_id`.
 *      - na nova (operacao=I) com `versao_anterior_id`.
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { RetificarDto } from '../../dto/retificar.dto';
import { sanitizeTiptap } from '../../infrastructure/tiptap-sanitizer';
import { PepRepository } from '../../infrastructure/pep.repository';
import { presentEvolucao, type EvolucaoResponse } from './evolucao.presenter';

@Injectable()
export class RetificarEvolucaoUseCase {
  constructor(
    private readonly repo: PepRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(uuid: string, dto: RetificarDto): Promise<EvolucaoResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('RetificarEvolucaoUseCase requires a request context.');
    }

    const original = await this.repo.findEvolucaoSnapshot(uuid);
    if (original === null) {
      throw new NotFoundException({
        code: 'EVOLUCAO_NOT_FOUND',
        message: 'Evolução original não encontrada.',
      });
    }
    if (original.assinada_em === null) {
      throw new UnprocessableEntityException({
        code: 'EVOLUCAO_NAO_ASSINADA',
        message:
          'Apenas evoluções assinadas precisam de retificação. Edite o rascunho diretamente.',
      });
    }

    let sanitized;
    try {
      sanitized = sanitizeTiptap(dto.conteudo);
    } catch (err: unknown) {
      throw new UnprocessableEntityException({
        code: 'EVOLUCAO_CONTEUDO_INVALIDO',
        message:
          err instanceof Error ? err.message : 'Conteúdo TipTap inválido.',
      });
    }

    const prestador = await this.repo.findPrestadorIdByUser(ctx.userId);
    if (prestador === null) {
      throw new UnprocessableEntityException({
        code: 'USUARIO_SEM_PRESTADOR',
        message: 'Usuário não possui cadastro de prestador.',
      });
    }

    const inserted = await this.repo.insertEvolucaoRascunho({
      tenantId: ctx.tenantId,
      atendimentoId: original.atendimento_id,
      pacienteId: original.paciente_id,
      profissionalId: prestador,
      tipoProfissional: 'MEDICO', // herdado/default — front pode ajustar via PATCH antes de assinar
      tipo: 'RETIFICACAO',
      conteudo: sanitized.doc as unknown as Record<string, unknown>,
      conteudoHtml: sanitized.htmlCache,
      textoLivre: sanitized.textoLivre,
      cids: null,
      sinaisVitaisInline: null,
      versaoAnteriorId: original.id,
      createdBy: ctx.userId,
    });

    await this.auditoria.record({
      tabela: 'evolucoes',
      registroId: inserted.id,
      operacao: 'I',
      diff: {
        evento: 'evolucao.retificada',
        versao_anterior_id: original.id.toString(),
        versao_anterior_uuid: uuid,
        motivo: dto.motivo,
      },
      finalidade: 'evolucao.retificada',
    });
    // Anota também na "original" (logical-only — trigger DB bloqueia UPDATE
    // físico). É um registro lógico de auditoria_eventos, não um UPDATE no
    // registro evolucoes.
    await this.auditoria.record({
      tabela: 'evolucoes',
      registroId: original.id,
      operacao: 'U',
      diff: {
        evento: 'evolucao.tem_retificacao',
        evolucao_nova_uuid: inserted.uuid_externo,
        motivo: dto.motivo,
      },
      finalidade: 'evolucao.tem_retificacao',
    });

    const row = await this.repo.findEvolucaoByUuid(inserted.uuid_externo);
    if (row === null) {
      throw new Error('Evolução retificada não encontrada.');
    }
    return presentEvolucao(row);
  }
}
