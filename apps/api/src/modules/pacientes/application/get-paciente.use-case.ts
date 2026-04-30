/**
 * Use case: `GET /v1/pacientes/{uuid}` — detalhe.
 *
 * **LGPD (RN-LGP-01)**: registra o acesso em `acessos_prontuario` com:
 *   - `finalidade` informada via header `X-Finalidade` (controller faz
 *     a leitura; aqui recebemos o valor já validado).
 *   - `perfil` derivado do JWT (primeiro perfil do usuário).
 *   - `modulo = 'PACIENTES'`.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../common/context/request-context';
import type { PacienteResponse } from '../dto/paciente.response';
import { PacientesRepository } from '../infrastructure/pacientes.repository';
import { presentPaciente } from './paciente.presenter';

export interface GetPacienteContext {
  finalidade: string;
  perfil: string;
  ip: string | null;
}

@Injectable()
export class GetPacienteUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: PacientesRepository,
  ) {}

  async execute(
    uuid: string,
    accessCtx: GetPacienteContext,
  ): Promise<PacienteResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('GetPacienteUseCase requires a request context.');
    }
    const tx = this.prisma.tx();

    const row = await this.repo.findByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'PACIENTE_NOT_FOUND',
        message: 'Paciente não encontrado.',
      });
    }

    // Resolve id BIGINT para o LOG (presenter não devolve).
    const idRow = await this.repo.findIdByUuid(uuid);
    if (idRow !== null) {
      await this.recordAccess(tx, idRow, accessCtx);
    }

    return presentPaciente(row);
  }

  private async recordAccess(
    tx: ReturnType<PrismaService['tx']>,
    pacienteId: bigint,
    accessCtx: GetPacienteContext,
  ): Promise<void> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      return;
    }
    await tx.$executeRaw`
      INSERT INTO acessos_prontuario
        (tenant_id, paciente_id, usuario_id, perfil, finalidade, modulo, ip)
      VALUES
        (${ctx.tenantId}::bigint,
         ${pacienteId}::bigint,
         ${ctx.userId}::bigint,
         ${accessCtx.perfil},
         ${accessCtx.finalidade},
         'PACIENTES',
         ${accessCtx.ip}::inet)
    `;
  }
}
