/**
 * `POST /v1/glosas/{uuid}/recurso` — registra recurso (RN-GLO-03).
 *
 * - Status atual: RECEBIDA ou EM_ANALISE.
 * - Prazo de recurso não pode estar vencido.
 * - Após gravação: status → EM_RECURSO.
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../common/context/request-context';
import { AuditoriaService } from '../../auditoria/application/auditoria.service';
import {
  isPrazoVencido,
  nextStatus,
  type GlosaStatus,
} from '../domain/glosa';
import type { CreateRecursoDto } from '../dto/create-recurso.dto';
import type { GlosaResponse } from '../dto/responses';
import { GlosasRepository } from '../infrastructure/glosas.repository';
import { presentGlosa } from './glosa.presenter';

function todayUtcIso(): string {
  const d = new Date();
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toIsoDate(d: Date | null): string | null {
  if (d === null) return null;
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

@Injectable()
export class CreateRecursoUseCase {
  constructor(
    private readonly repo: GlosasRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    glosaUuid: string,
    dto: CreateRecursoDto,
  ): Promise<GlosaResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('CreateRecursoUseCase requires request context.');
    }

    const row = await this.repo.findGlosaByUuid(glosaUuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'GLOSA_NOT_FOUND',
        message: 'Glosa não encontrada.',
      });
    }

    const target = nextStatus(row.status as GlosaStatus, 'enviar_recurso');
    if (target === null) {
      throw new UnprocessableEntityException({
        code: 'GLOSA_TRANSICAO_INVALIDA',
        message: `Glosa em status ${row.status} não aceita recurso.`,
      });
    }

    const prazoIso = toIsoDate(row.prazo_recurso);
    if (prazoIso !== null && isPrazoVencido(prazoIso)) {
      throw new UnprocessableEntityException({
        code: 'GLOSA_PRAZO_VENCIDO',
        message: `Prazo de recurso vencido em ${prazoIso}.`,
      });
    }

    const dataRecurso = dto.dataRecurso ?? todayUtcIso();

    await this.repo.updateRecurso({
      id: row.id,
      recurso: dto.recurso,
      recursoDocumentoUrl: dto.recursoDocumentoUrl ?? null,
      dataRecurso,
      recursoPor: ctx.userId,
    });

    await this.auditoria.record({
      tabela: 'glosas',
      registroId: row.id,
      operacao: 'U',
      diff: {
        evento: 'glosa.recurso_registrado',
        status_anterior: row.status,
        status_novo: target,
        data_recurso: dataRecurso,
      },
      finalidade: 'glosa.recurso_registrado',
    });

    const updated = await this.repo.findGlosaByUuid(glosaUuid);
    if (updated === null) {
      throw new Error('Glosa após recurso não encontrada (RLS?).');
    }
    return presentGlosa(updated);
  }
}
