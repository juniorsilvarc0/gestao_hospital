/**
 * Use case: `DELETE /v1/prestadores/:uuid/especialidades/:especialidadeUuid`
 * — remove vínculo M:N. Auditoria APP-LEVEL.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import { AuditoriaService } from '../../auditoria/application/auditoria.service';

@Injectable()
export class RemoveEspecialidadeUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    prestadorUuid: string,
    especialidadeIdentifier: string,
  ): Promise<void> {
    const tx = this.prisma.tx();

    const prestador = await tx.prestadores.findFirst({
      where: { uuid_externo: prestadorUuid, deleted_at: null },
      select: { id: true },
    });
    if (prestador === null) {
      throw new NotFoundException({
        code: 'PRESTADOR_NOT_FOUND',
        message: 'Prestador não encontrado.',
      });
    }

    const isUuid = /^[0-9a-fA-F-]{36}$/.test(especialidadeIdentifier);
    const especialidade = await tx.especialidades.findFirst({
      where: isUuid
        ? // @ts-expect-error — coluna ainda pode não existir no schema atual
          { uuid_externo: especialidadeIdentifier }
        : { codigo_cbos: especialidadeIdentifier },
      select: { id: true, codigo_cbos: true },
    });
    if (especialidade === null) {
      throw new NotFoundException({
        code: 'ESPECIALIDADE_NOT_FOUND',
        message: 'Especialidade não encontrada (catálogo CBOS).',
      });
    }

    const result = await tx.prestadores_especialidades.deleteMany({
      where: {
        prestador_id: prestador.id,
        especialidade_id: especialidade.id,
      },
    });
    if (result.count === 0) {
      throw new NotFoundException({
        code: 'PRESTADOR_ESPECIALIDADE_NOT_LINKED',
        message: 'Prestador não possui vínculo com esta especialidade.',
      });
    }

    await this.auditoria.record({
      tabela: 'prestadores_especialidades',
      registroId: prestador.id,
      operacao: 'D',
      diff: {
        evento: 'prestador.especialidade.removed',
        prestador_id: prestador.id.toString(),
        especialidade_id: especialidade.id.toString(),
        codigo_cbos: especialidade.codigo_cbos,
      },
      finalidade: 'cadastro.prestador.especialidade',
    });
  }
}
