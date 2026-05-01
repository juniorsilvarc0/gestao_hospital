/**
 * `GET /v1/documentos/:uuid` — detalhe.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { PepRepository } from '../../infrastructure/pep.repository';
import {
  presentDocumento,
  type DocumentoResponse,
} from './documento.presenter';

@Injectable()
export class GetDocumentoUseCase {
  constructor(private readonly repo: PepRepository) {}

  async execute(uuid: string): Promise<DocumentoResponse> {
    const row = await this.repo.findDocumentoByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'DOCUMENTO_NOT_FOUND',
        message: 'Documento não encontrado.',
      });
    }
    return presentDocumento(row);
  }
}
