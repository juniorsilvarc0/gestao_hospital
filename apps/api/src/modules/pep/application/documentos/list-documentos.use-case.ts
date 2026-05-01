/**
 * `GET /v1/atendimentos/:atendUuid/documentos` — lista documentos
 * emitidos no atendimento (DESC por `data_emissao`, limit fixo 200).
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { PepRepository } from '../../infrastructure/pep.repository';
import {
  presentDocumento,
  type DocumentoResponse,
} from './documento.presenter';

@Injectable()
export class ListDocumentosUseCase {
  constructor(private readonly repo: PepRepository) {}

  async execute(atendimentoUuid: string): Promise<{ data: DocumentoResponse[] }> {
    const atend = await this.repo.findAtendimentoBasic(atendimentoUuid);
    if (atend === null) {
      throw new NotFoundException({
        code: 'ATENDIMENTO_NOT_FOUND',
        message: 'Atendimento não encontrado.',
      });
    }
    const rows = await this.repo.listDocumentosByAtendimento(atend.id);
    return { data: rows.map(presentDocumento) };
  }
}
