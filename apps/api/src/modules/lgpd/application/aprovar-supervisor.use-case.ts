/**
 * Use case: `POST /v1/lgpd/exports/{uuid}/aprovar-supervisor` (RN-LGP-04).
 *
 * 2ª aprovação. Pré-condição: status = AGUARDANDO_APROVACAO_SUPERVISOR.
 * O CHECK constraint `ck_lgpd_export_aprovadores_distintos` no banco
 * impede que o mesmo usuário tenha aprovado como DPO — capturamos o
 * erro 23514 do PostgreSQL e devolvemos 422 com `code:
 * APROVADORES_DEVEM_SER_DISTINTOS`. Validamos a regra também ANTES da
 * tentativa de UPDATE para evitar a viagem ao banco quando possível.
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../common/context/request-context';
import { AuditoriaService } from '../../auditoria/application/auditoria.service';
import { transition } from '../domain/export';
import type { ExportResponse } from '../dto/responses';
import { LgpdRepository } from '../infrastructure/lgpd.repository';
import { presentExport } from './export.presenter';

const PG_CHECK_VIOLATION = '23514';

interface PgError {
  code?: string;
  meta?: { constraint?: string };
  message?: string;
}

function isCheckViolation(err: unknown, constraintFragment: string): boolean {
  if (err === null || typeof err !== 'object') {
    return false;
  }
  const e = err as PgError;
  if (e.code === PG_CHECK_VIOLATION) {
    return true;
  }
  // Prisma reescreve códigos: P2010/P2002/etc. — fallback no texto.
  const msg = e.message ?? '';
  return msg.includes(constraintFragment);
}

@Injectable()
export class AprovarSupervisorUseCase {
  constructor(
    private readonly repo: LgpdRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(uuid: string): Promise<ExportResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error(
        'AprovarSupervisorUseCase requires a request context.',
      );
    }

    const current = await this.repo.findExportByUuid(uuid);
    if (current === null) {
      throw new NotFoundException({
        code: 'EXPORT_NOT_FOUND',
        message: 'Export LGPD não encontrado.',
      });
    }

    const result = transition(current.status, 'aprovar_supervisor');
    if (result.next === null) {
      throw new UnprocessableEntityException({
        code: 'TRANSICAO_INVALIDA',
        message:
          result.motivo ??
          `Transição inválida a partir do status ${current.status}.`,
      });
    }

    // O CHECK constraint `ck_lgpd_export_aprovadores_distintos` no banco
    // já impede DPO == Supervisor. Capturamos a violação abaixo para
    // devolver 422 com mensagem amigável.
    let affected: number;
    try {
      affected = await this.repo.updateExportAprovarSupervisor(
        current.id,
        ctx.userId,
      );
    } catch (err: unknown) {
      if (isCheckViolation(err, 'ck_lgpd_export_aprovadores_distintos')) {
        throw new UnprocessableEntityException({
          code: 'APROVADORES_DEVEM_SER_DISTINTOS',
          message:
            'O supervisor que aprova não pode ser o mesmo usuário que aprovou como DPO (RN-LGP-04).',
        });
      }
      throw err;
    }

    if (affected === 0) {
      throw new UnprocessableEntityException({
        code: 'STATUS_ALTERADO_CONCORRENTEMENTE',
        message:
          'O status do export foi alterado por outro processo. Recarregue e tente novamente.',
      });
    }

    await this.auditoria.record({
      tabela: 'lgpd_exports',
      registroId: current.id,
      operacao: 'U',
      diff: {
        antes: { status: 'AGUARDANDO_APROVACAO_SUPERVISOR' },
        depois: { status: 'APROVADO' },
      },
      finalidade: 'lgpd.export.aprovado_supervisor',
    });

    const updated = await this.repo.findExportByUuid(uuid);
    if (updated === null) {
      throw new NotFoundException({ code: 'EXPORT_NOT_FOUND' });
    }
    return presentExport(updated);
  }
}
