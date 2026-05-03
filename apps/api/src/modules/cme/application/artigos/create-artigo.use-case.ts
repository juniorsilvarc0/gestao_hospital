/**
 * `POST /v1/cme/lotes/{uuid}/artigos` — adiciona artigo a um lote.
 *
 * Só permite criar em lotes não-terminais (EM_PROCESSAMENTO ou
 * AGUARDANDO_INDICADOR). Lote LIBERADO já saiu do circuito de
 * preparação; REPROVADO/EXPIRADO obviamente não recebe novos artigos.
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import { CME_LOTE_NAO_TERMINAIS, type CmeLoteStatus } from '../../domain/lote';
import type { CreateArtigoDto } from '../../dto/create-artigo.dto';
import type { ArtigoResponse } from '../../dto/responses';
import { CmeRepository } from '../../infrastructure/cme.repository';
import { presentArtigo } from './artigo.presenter';

@Injectable()
export class CreateArtigoUseCase {
  constructor(
    private readonly repo: CmeRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    loteUuid: string,
    dto: CreateArtigoDto,
  ): Promise<ArtigoResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('CreateArtigoUseCase requires request context.');
    }

    const lote = await this.repo.findLoteByUuid(loteUuid);
    if (lote === null) {
      throw new NotFoundException({
        code: 'CME_LOTE_NOT_FOUND',
        message: 'Lote não encontrado.',
      });
    }

    if (!CME_LOTE_NAO_TERMINAIS.has(lote.status as CmeLoteStatus)) {
      throw new UnprocessableEntityException({
        code: 'CME_LOTE_NAO_ACEITA_ARTIGOS',
        message: `Lote em status ${lote.status} não aceita novos artigos.`,
      });
    }

    const inserted = await this.repo.insertArtigo({
      tenantId: ctx.tenantId,
      loteId: lote.id,
      codigoArtigo: dto.codigoArtigo,
      descricao: dto.descricao ?? null,
      userId: ctx.userId,
    });

    await this.auditoria.record({
      tabela: 'cme_artigos',
      registroId: inserted.id,
      operacao: 'I',
      diff: {
        evento: 'cme.artigo_criado',
        lote_numero: lote.numero,
        codigo_artigo: dto.codigoArtigo,
      },
      finalidade: 'cme.artigo_criado',
    });

    const row = await this.repo.findArtigoByUuid(inserted.uuidExterno);
    if (row === null) {
      throw new Error('Artigo criado não encontrado (RLS?).');
    }
    return presentArtigo(row);
  }
}
