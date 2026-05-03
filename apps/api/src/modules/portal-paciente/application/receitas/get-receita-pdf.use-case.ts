/**
 * `GET /v1/portal/paciente/receitas/{uuid}/pdf` — devolve o PDF da
 * receita.
 *
 * Estratégia: REAPROVEITA `BaixarDocumentoPdfUseCase` do `PepModule`
 * (exporta o `PdfRendererService` + `PepRepository`). Antes de delegar,
 * validamos:
 *
 *   1. O documento existe e pertence ao paciente do request.
 *   2. O documento é do tipo `RECEITA` (portal não devolve resumo de
 *      alta, evolução etc.).
 *
 * Em produção, vale considerar exigir `assinado_em IS NOT NULL` —
 * receitas digitais sem assinatura ICP-Brasil não têm validade
 * fora do ambulatório que prescreveu. Aqui apenas alertamos via flag
 * `assinada` no metadata (o PDF é entregue mesmo sem assinatura por
 * compatibilidade com fluxos de "receita simples" — RN-PEP-07).
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { BaixarDocumentoPdfUseCase } from '../../../pep/application/documentos/baixar-documento-pdf.use-case';
import type { BaixarPdfResult } from '../../../pep/application/documentos/baixar-documento-pdf.use-case';
import { PacienteContextResolver } from '../../domain/paciente-context';
import { PortalPacienteRepository } from '../../infrastructure/portal-paciente.repository';

@Injectable()
export class GetReceitaPdfUseCase {
  constructor(
    private readonly resolver: PacienteContextResolver,
    private readonly repo: PortalPacienteRepository,
    private readonly baixarDocumentoUC: BaixarDocumentoPdfUseCase,
  ) {}

  async execute(documentoUuid: string): Promise<BaixarPdfResult> {
    const ctx = await this.resolver.resolve();
    const doc = await this.repo.findDocumentoPacienteByUuid(
      ctx.pacienteId,
      documentoUuid,
    );
    if (doc === null) {
      throw new NotFoundException({
        code: 'RECEITA_NOT_FOUND',
        message: 'Receita não encontrada para o paciente.',
      });
    }
    if (doc.tipo !== 'RECEITA') {
      throw new BadRequestException({
        code: 'DOCUMENTO_TIPO_INVALIDO',
        message: `Endpoint exige documento do tipo RECEITA (recebido: ${doc.tipo}).`,
      });
    }
    return this.baixarDocumentoUC.execute(documentoUuid);
  }
}
