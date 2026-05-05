/**
 * Use case: `GET /v1/lgpd/exportacao/{uuid}` (download do bundle FHIR).
 *
 * Pré-condições:
 *   - Export existe.
 *   - Status = PRONTO_PARA_DOWNLOAD (caso contrário, 422).
 *   - `data_expiracao > now()` — senão devolvemos **410 Gone** e
 *     marcamos o status=EXPIRADO (RN-LGP-04, expira em 7 dias).
 *
 * O método retorna `{ contentType, content, filename, hash }` —
 * o controller transforma em response binário com `Content-Disposition`.
 */
import {
  GoneException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../common/context/request-context';
import { AuditoriaService } from '../../auditoria/application/auditoria.service';
import { isExportExpirado } from '../domain/export';
import { LgpdRepository } from '../infrastructure/lgpd.repository';
import { LgpdExportInMemoryStore } from './gerar-export.use-case';

export interface BaixarExportContext {
  ip: string | null;
}

export interface BaixarExportResult {
  contentType: 'application/fhir+json';
  filename: string;
  hashSha256: string | null;
  content: string;
}

@Injectable()
export class BaixarExportUseCase {
  constructor(
    private readonly repo: LgpdRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    uuid: string,
    accessCtx: BaixarExportContext,
  ): Promise<BaixarExportResult> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('BaixarExportUseCase requires a request context.');
    }

    const current = await this.repo.findExportByUuid(uuid);
    if (current === null) {
      throw new NotFoundException({
        code: 'EXPORT_NOT_FOUND',
        message: 'Export LGPD não encontrado.',
      });
    }

    if (
      isExportExpirado({
        status: current.status,
        dataExpiracao: current.data_expiracao,
      })
    ) {
      // Marca como EXPIRADO (best-effort) e devolve 410.
      await this.repo.updateExportExpirado(current.id);
      throw new GoneException({
        code: 'EXPORT_EXPIRADO',
        message:
          'Export expirado (7 dias após geração — RN-LGP-04). Solicite novo export.',
      });
    }

    if (current.status !== 'PRONTO_PARA_DOWNLOAD') {
      throw new UnprocessableEntityException({
        code: 'EXPORT_INDISPONIVEL',
        message: `Export não está disponível para download (status atual: ${current.status}).`,
      });
    }

    const payload = LgpdExportInMemoryStore.get(current.uuid_externo);
    if (payload === undefined) {
      // Geração feita em outra réplica / após restart. Phase 13+ usar S3
      // garante persistência; aqui devolvemos 422 instrutivo.
      throw new UnprocessableEntityException({
        code: 'EXPORT_PAYLOAD_INDISPONIVEL',
        message:
          'O conteúdo do export não está disponível neste nó (storage in-memory). Solicite nova geração.',
      });
    }

    const affected = await this.repo.updateExportBaixado(
      current.id,
      accessCtx.ip,
    );
    if (affected === 0) {
      throw new UnprocessableEntityException({
        code: 'STATUS_ALTERADO_CONCORRENTEMENTE',
        message:
          'O export já foi baixado ou expirou nesse intervalo. Recarregue.',
      });
    }

    await this.auditoria.record({
      tabela: 'lgpd_exports',
      registroId: current.id,
      operacao: 'U',
      diff: {
        antes: { status: 'PRONTO_PARA_DOWNLOAD' },
        depois: { status: 'BAIXADO', ipDownload: accessCtx.ip },
      },
      finalidade: 'lgpd.export.baixado',
    });

    return {
      contentType: 'application/fhir+json',
      filename: `lgpd-export-${current.uuid_externo}.json`,
      hashSha256: current.arquivo_hash_sha256,
      content: payload,
    };
  }
}
