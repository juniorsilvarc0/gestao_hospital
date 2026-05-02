/**
 * `GET /v1/tiss/guias/{uuid}/xml` — devolve o XML cru + hash.
 *
 * Cabe ao controller setar `Content-Type: application/xml` quando o
 * cliente requisitar XML direto. Aqui devolvemos o objeto estruturado.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import type { GuiaXmlResponse } from '../../dto/responses';
import { TissRepository } from '../../infrastructure/tiss.repository';
import { presentGuiaXml } from './guia.presenter';

@Injectable()
export class GetGuiaXmlUseCase {
  constructor(private readonly repo: TissRepository) {}

  async execute(uuid: string): Promise<GuiaXmlResponse> {
    const row = await this.repo.findGuiaByUuidWithXml(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'GUIA_NOT_FOUND',
        message: 'Guia TISS não encontrada.',
      });
    }
    return presentGuiaXml(row);
  }
}
