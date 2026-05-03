/**
 * `POST /v1/same/prontuarios` — cadastra prontuário físico.
 *
 * Idempotência: tabela tem `uq_same_paciente` (1 prontuário por
 * paciente) e `uq_same_pasta` (numero_pasta único por tenant). Em
 * conflito, traduzimos o erro do banco em 422 amigável.
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { CreateProntuarioDto } from '../../dto/create-prontuario.dto';
import type { ProntuarioResponse } from '../../dto/responses';
import { SameRepository } from '../../infrastructure/same.repository';
import { presentProntuario } from './prontuario.presenter';

interface PgConstraintError {
  code?: string;
  meta?: { constraint?: string };
}

function isPgUniqueViolation(err: unknown): err is PgConstraintError {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as PgConstraintError).code === 'P2010'
  );
}

@Injectable()
export class CreateProntuarioUseCase {
  constructor(
    private readonly repo: SameRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(dto: CreateProntuarioDto): Promise<ProntuarioResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('CreateProntuarioUseCase requires request context.');
    }

    const pacienteId = await this.repo.findPacienteIdByUuid(dto.pacienteUuid);
    if (pacienteId === null) {
      throw new NotFoundException({
        code: 'PACIENTE_NOT_FOUND',
        message: 'Paciente não encontrado.',
      });
    }

    let inserted: { id: bigint; uuidExterno: string };
    try {
      inserted = await this.repo.insertProntuario({
        tenantId: ctx.tenantId,
        pacienteId,
        numeroPasta: dto.numeroPasta,
        localizacao: dto.localizacao ?? null,
        observacao: dto.observacao ?? null,
        userId: ctx.userId,
      });
    } catch (err: unknown) {
      // Trata violações de unicidade (paciente único / numero_pasta único).
      if (
        err instanceof Error &&
        (err.message.includes('uq_same_paciente') ||
          err.message.includes('uq_same_pasta') ||
          isPgUniqueViolation(err))
      ) {
        const motivo = err.message.includes('uq_same_pasta')
          ? `Já existe prontuário com número de pasta ${dto.numeroPasta}.`
          : 'Paciente já possui prontuário físico cadastrado.';
        throw new ConflictException({
          code: 'PRONTUARIO_DUPLICADO',
          message: motivo,
        });
      }
      throw err;
    }

    await this.auditoria.record({
      tabela: 'same_prontuarios',
      registroId: inserted.id,
      operacao: 'I',
      diff: {
        evento: 'same.prontuario.criado',
        paciente_uuid: dto.pacienteUuid,
        numero_pasta: dto.numeroPasta,
      },
      finalidade: 'same.prontuario.criado',
    });

    const row = await this.repo.findProntuarioByUuid(inserted.uuidExterno);
    if (row === null) {
      throw new Error('Prontuário criado não encontrado (RLS?).');
    }
    return presentProntuario(row);
  }
}
