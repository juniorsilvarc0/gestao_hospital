/**
 * `PATCH /v1/evolucoes/:uuid` — atualiza rascunho.
 *
 * Regra: só rascunhos podem ser editados (`assinada_em IS NULL`). Em
 * registros assinados, a trigger DDL `tg_imutavel_apos_assinatura` bloqueia
 * o UPDATE no banco (INVARIANTE #3). Aqui também checamos no use case
 * para devolver 409 amigável (em vez de 500 do trigger).
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { UpdateEvolucaoDto } from '../../dto/create-evolucao.dto';
import { sanitizeTiptap } from '../../infrastructure/tiptap-sanitizer';
import { PepRepository } from '../../infrastructure/pep.repository';
import { presentEvolucao, type EvolucaoResponse } from './evolucao.presenter';

@Injectable()
export class UpdateEvolucaoRascunhoUseCase {
  constructor(
    private readonly repo: PepRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    uuid: string,
    dto: UpdateEvolucaoDto,
  ): Promise<EvolucaoResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('UpdateEvolucaoRascunhoUseCase requires a request context.');
    }

    const snapshot = await this.repo.findEvolucaoSnapshot(uuid);
    if (snapshot === null) {
      throw new NotFoundException({
        code: 'EVOLUCAO_NOT_FOUND',
        message: 'Evolução não encontrada.',
      });
    }
    if (snapshot.assinada_em !== null) {
      throw new ConflictException({
        code: 'EVOLUCAO_IMUTAVEL',
        message:
          'Evolução assinada é imutável (RN-PEP-03). Use POST /retificar para criar nova versão.',
      });
    }

    let conteudoOut: Record<string, unknown> | undefined;
    let conteudoHtml: string | undefined;
    let textoLivre: string | undefined;
    if (dto.conteudo !== undefined) {
      try {
        const s = sanitizeTiptap(dto.conteudo);
        conteudoOut = s.doc as unknown as Record<string, unknown>;
        conteudoHtml = s.htmlCache;
        textoLivre = s.textoLivre;
      } catch (err: unknown) {
        throw new UnprocessableEntityException({
          code: 'EVOLUCAO_CONTEUDO_INVALIDO',
          message:
            err instanceof Error ? err.message : 'Conteúdo TipTap inválido.',
        });
      }
    }

    await this.repo.updateEvolucaoRascunho(snapshot.id, snapshot.data_hora, {
      conteudo: conteudoOut,
      conteudoHtml,
      textoLivre,
      cids: dto.cids,
      sinaisVitais:
        dto.sinaisVitais === undefined
          ? undefined
          : (dto.sinaisVitais as unknown as Record<string, unknown>),
      updatedBy: ctx.userId,
    });

    await this.auditoria.record({
      tabela: 'evolucoes',
      registroId: snapshot.id,
      operacao: 'U',
      diff: {
        evento: 'evolucao.rascunho.atualizado',
        // PHI-safe: campos editados, sem conteúdo bruto
        campos_alterados: Object.keys(dto),
      },
      finalidade: 'evolucao.rascunho.atualizado',
    });

    const updated = await this.repo.findEvolucaoByUuid(uuid);
    if (updated === null) {
      throw new Error('Evolução atualizada não encontrada.');
    }
    return presentEvolucao(updated);
  }
}
