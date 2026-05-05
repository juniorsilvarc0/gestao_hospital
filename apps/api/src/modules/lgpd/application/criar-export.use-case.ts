/**
 * Use case: `POST /v1/lgpd/exports`.
 *
 * Inicia o ciclo dual-approval (RN-LGP-04):
 *   1. INSERT em `lgpd_exports` com status=AGUARDANDO_APROVACAO_DPO.
 *   2. DPO aprova (`POST /aprovar-dpo`) → AGUARDANDO_APROVACAO_SUPERVISOR.
 *   3. Supervisor aprova (`POST /aprovar-supervisor`) → APROVADO.
 *   4. `POST /gerar` → GERANDO → PRONTO_PARA_DOWNLOAD (7 dias).
 *
 * Esta entrega exige `pacienteUuid`. Exports em massa (paciente_id NULL)
 * ficam para fase futura.
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../common/context/request-context';
import { AuditoriaService } from '../../auditoria/application/auditoria.service';
import type { CriarExportDto } from '../dto/criar-export.dto';
import type { ExportResponse } from '../dto/responses';
import { LgpdRepository } from '../infrastructure/lgpd.repository';
import { presentExport } from './export.presenter';

@Injectable()
export class CriarExportUseCase {
  constructor(
    private readonly repo: LgpdRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(dto: CriarExportDto): Promise<ExportResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('CriarExportUseCase requires a request context.');
    }

    if (dto.pacienteUuid === undefined) {
      throw new UnprocessableEntityException({
        code: 'PACIENTE_OBRIGATORIO',
        message: 'pacienteUuid é obrigatório nesta versão do export LGPD.',
      });
    }

    const pacienteId = await this.repo.findPacienteIdByUuid(dto.pacienteUuid);
    if (pacienteId === null) {
      throw new NotFoundException({
        code: 'PACIENTE_NOT_FOUND',
        message: 'Paciente não encontrado.',
      });
    }

    const inserted = await this.repo.insertExport({
      tenantId: ctx.tenantId,
      pacienteId,
      solicitacaoLgpdId: null,
      formato: dto.formato ?? 'FHIR_JSON',
      motivoSolicitacao: dto.motivoSolicitacao,
      solicitadoPorId: ctx.userId,
    });

    await this.auditoria.record({
      tabela: 'lgpd_exports',
      registroId: inserted.id,
      operacao: 'I',
      diff: {
        status: inserted.status,
        formato: inserted.formato,
        pacienteUuid: dto.pacienteUuid,
      },
      finalidade: 'lgpd.export.solicitado',
    });

    return presentExport(inserted);
  }
}
