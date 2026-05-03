/**
 * `POST /v1/portal/paciente/agendamento` — auto-agendamento.
 *
 * Estratégia: REAPROVEITA o `CreateAgendamentoUseCase` do
 * `AgendamentoModule` para não duplicar a lógica de overbooking,
 * teleconsulta e auditoria. A camada-portal apenas:
 *
 *   1. Resolve `pacienteUuid` do contexto (paciente NUNCA informa);
 *   2. Valida que `convenioUuid` (se presente) está em
 *      `pacientes_convenios` ativos do paciente — RN-portal de
 *      isolamento (paciente A não usa convênio do paciente B);
 *   3. Delega para `CreateAgendamentoUseCase` com `origem='PORTAL'`,
 *      `encaixe=false` (portal não pode forçar encaixe).
 *
 * O conflito de slot é tratado pelo EXCLUDE constraint
 * (RN-AGE-01) → vira 409 (`AGENDAMENTO_CONFLITO`) no controller.
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { CreateAgendamentoUseCase } from '../../../agendamento/application/agendamentos/create-agendamento.use-case';
import type { CreateAgendamentoDto } from '../../../agendamento/dto/create-agendamento.dto';
import type { AgendamentoResponse } from '../../../agendamento/dto/slot.response';
import { AgendamentoRepository } from '../../../agendamento/infrastructure/agendamento.repository';
import { PacienteContextResolver } from '../../domain/paciente-context';
import { PortalPacienteRepository } from '../../infrastructure/portal-paciente.repository';
import type { AutoAgendarDto } from '../../dto/auto-agendar.dto';

@Injectable()
export class AutoAgendarUseCase {
  constructor(
    private readonly resolver: PacienteContextResolver,
    private readonly portalRepo: PortalPacienteRepository,
    private readonly agendamentoRepo: AgendamentoRepository,
    private readonly createAgendamentoUC: CreateAgendamentoUseCase,
  ) {}

  async execute(dto: AutoAgendarDto): Promise<AgendamentoResponse> {
    const ctx = await this.resolver.resolve();

    // RN-portal: convênio precisa pertencer ao paciente.
    if (dto.convenioUuid !== undefined) {
      const convenios = await this.portalRepo.listConveniosAtivos(
        ctx.pacienteId,
      );
      if (convenios.length === 0) {
        throw new BadRequestException({
          code: 'PORTAL_PACIENTE_SEM_CONVENIO',
          message:
            'Paciente sem convênio ativo cadastrado — auto-agendamento via convênio indisponível.',
        });
      }
      const convenioId = await this.agendamentoRepo.findConvenioIdByUuid(
        dto.convenioUuid,
      );
      if (convenioId === null) {
        throw new NotFoundException({
          code: 'CONVENIO_NOT_FOUND',
          message: 'Convênio não encontrado.',
        });
      }
      const isOwn = convenios.some((c) => c.convenio_id === convenioId);
      if (!isOwn) {
        throw new BadRequestException({
          code: 'PORTAL_PACIENTE_CONVENIO_NAO_VINCULADO',
          message:
            'Convênio informado não está vinculado ao paciente. Atualize seu cadastro na recepção.',
        });
      }

      if (dto.planoUuid !== undefined) {
        const planoId = await this.agendamentoRepo.findPlanoIdByUuid(
          dto.planoUuid,
        );
        if (planoId === null) {
          throw new NotFoundException({
            code: 'PLANO_NOT_FOUND',
            message: 'Plano não encontrado.',
          });
        }
        const isPlanoOwn = convenios.some(
          (c) => c.convenio_id === convenioId && c.plano_id === planoId,
        );
        if (!isPlanoOwn) {
          throw new BadRequestException({
            code: 'PORTAL_PACIENTE_PLANO_NAO_VINCULADO',
            message:
              'Plano informado não está vinculado à carteirinha do paciente.',
          });
        }
      }
    }

    // Encaixe é proibido via portal: forçar `encaixe = false` mesmo se
    // o cliente tentar mandar (DTO já não aceita o campo, mas reforço
    // explícito ao montar o payload).
    const internalDto: CreateAgendamentoDto = {
      recursoUuid: dto.recursoUuid,
      pacienteUuid: ctx.pacienteUuid,
      inicio: dto.inicio,
      fim: dto.fim,
      tipo: dto.tipo,
      origem: 'PORTAL',
      encaixe: false,
      ...(dto.procedimentoUuid !== undefined
        ? { procedimentoUuid: dto.procedimentoUuid }
        : {}),
      ...(dto.convenioUuid !== undefined
        ? { convenioUuid: dto.convenioUuid }
        : {}),
      ...(dto.planoUuid !== undefined ? { planoUuid: dto.planoUuid } : {}),
      ...(dto.observacao !== undefined ? { observacao: dto.observacao } : {}),
    };

    return this.createAgendamentoUC.execute(internalDto);
  }
}
