/**
 * `GET /v1/documentos/:uuid/pdf` — devolve o binário do PDF.
 *
 * O PDF é o placeholder gerado por `PdfRendererService` no momento da
 * emissão (e re-renderizado após assinatura — selo). Em Fase 13, troca
 * para Puppeteer real.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { PdfRendererService } from '../../infrastructure/pdf-renderer.service';
import { PepRepository } from '../../infrastructure/pep.repository';

export interface BaixarPdfResult {
  uuid: string;
  buffer: Buffer;
  filename: string;
  assinado: boolean;
}

@Injectable()
export class BaixarDocumentoPdfUseCase {
  constructor(
    private readonly repo: PepRepository,
    private readonly pdf: PdfRendererService,
  ) {}

  async execute(uuid: string): Promise<BaixarPdfResult> {
    const doc = await this.repo.findDocumentoByUuid(uuid);
    if (doc === null) {
      throw new NotFoundException({
        code: 'DOCUMENTO_NOT_FOUND',
        message: 'Documento não encontrado.',
      });
    }
    let buffer: Buffer;
    try {
      buffer = await this.pdf.readPdf(uuid);
    } catch (err: unknown) {
      throw new NotFoundException({
        code: 'DOCUMENTO_PDF_NOT_FOUND',
        message: 'PDF do documento não encontrado no storage.',
      });
    }
    return {
      uuid,
      buffer,
      filename: `documento-${uuid}.pdf`,
      assinado: doc.assinado_em !== null,
    };
  }
}
