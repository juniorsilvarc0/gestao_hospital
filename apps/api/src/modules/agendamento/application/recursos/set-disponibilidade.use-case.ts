/**
 * `POST /v1/agendas/recursos/:uuid/disponibilidade` — bulk replace.
 *
 * O endpoint substitui TODA a disponibilidade vigente do recurso pela
 * lista informada (operação atômica em transação). Aceita janelas
 * semanais (`diaSemana` 0..6, dom=0) e/ou janelas em datas específicas.
 *
 * Validações:
 *   - Cada janela exige `diaSemana` OU `dataEspecifica` (CHECK do DDL).
 *   - `horaFim > horaInicio` (lógico — checado aqui, não no DDL).
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../../common/context/request-context';
import type {
  JanelaDisponibilidadeDto,
  SetDisponibilidadesDto,
} from '../../dto/disponibilidade.dto';
import type { DisponibilidadeResponse } from '../../dto/slot.response';
import { AgendamentoRepository } from '../../infrastructure/agendamento.repository';
import { presentDisponibilidade } from './recurso.presenter';

@Injectable()
export class SetDisponibilidadeUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: AgendamentoRepository,
  ) {}

  async execute(
    recursoUuid: string,
    dto: SetDisponibilidadesDto,
  ): Promise<DisponibilidadeResponse[]> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('SetDisponibilidadeUseCase requires a request context.');
    }

    const recursoId = await this.repo.findRecursoIdByUuid(recursoUuid);
    if (recursoId === null) {
      throw new NotFoundException({
        code: 'RECURSO_NOT_FOUND',
        message: 'Recurso não encontrado.',
      });
    }

    for (const j of dto.janelas) {
      this.validarJanela(j);
    }

    const tx = this.prisma.tx();

    // Replace atômico: delete + reinserção. Como tudo está dentro da
    // mesma transação aberta pelo TenantContextInterceptor, RLS aplica.
    await tx.$executeRaw`
      DELETE FROM agendas_disponibilidade
       WHERE recurso_id = ${recursoId}::bigint
    `;

    for (const j of dto.janelas) {
      const ativa = j.ativa ?? true;
      await tx.$executeRaw`
        INSERT INTO agendas_disponibilidade (
          tenant_id, recurso_id,
          dia_semana, data_especifica,
          hora_inicio, hora_fim,
          vigencia_inicio, vigencia_fim,
          ativa
        ) VALUES (
          ${ctx.tenantId}::bigint,
          ${recursoId}::bigint,
          ${j.diaSemana ?? null}::int,
          ${j.dataEspecifica ?? null}::date,
          ${j.horaInicio}::time,
          ${j.horaFim}::time,
          ${j.vigenciaInicio ?? null}::date,
          ${j.vigenciaFim ?? null}::date,
          ${ativa}
        )
      `;
    }

    const rows = await this.repo.listDisponibilidadeRecurso(recursoId);
    return rows.map(presentDisponibilidade);
  }

  private validarJanela(j: JanelaDisponibilidadeDto): void {
    if (j.diaSemana === undefined && j.dataEspecifica === undefined) {
      throw new BadRequestException({
        code: 'DISPONIBILIDADE_DIA_OU_DATA_REQUIRED',
        message: 'Cada janela exige diaSemana ou dataEspecifica.',
      });
    }
    if (j.horaFim <= j.horaInicio) {
      throw new BadRequestException({
        code: 'DISPONIBILIDADE_PERIODO_INVALIDO',
        message: 'horaFim deve ser maior que horaInicio.',
      });
    }
  }
}
