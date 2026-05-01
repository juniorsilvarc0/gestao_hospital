/**
 * `PATCH /v1/cirurgias/{uuid}` — atualização parcial enquanto a cirurgia
 * ainda não começou.
 *
 * Apenas status `AGENDADA` ou `CONFIRMADA` aceitam edição. Mudança de
 * sala/horário re-valida sobreposição (RN-CC-01).
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { UpdateCirurgiaDto } from '../../dto/update-cirurgia.dto';
import type { CirurgiaResponse } from '../../dto/responses';
import { CentroCirurgicoRepository } from '../../infrastructure/centro-cirurgico.repository';
import { presentCirurgia } from './cirurgia.presenter';

const STATUSES_EDITAVEIS = new Set(['AGENDADA', 'CONFIRMADA']);

@Injectable()
export class UpdateCirurgiaUseCase {
  constructor(
    private readonly repo: CentroCirurgicoRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(
    uuid: string,
    dto: UpdateCirurgiaDto,
  ): Promise<CirurgiaResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('UpdateCirurgiaUseCase requires a request context.');
    }

    const cir = await this.repo.findCirurgiaByUuid(uuid);
    if (cir === null) {
      throw new NotFoundException({
        code: 'CIRURGIA_NOT_FOUND',
        message: 'Cirurgia não encontrada.',
      });
    }
    if (!STATUSES_EDITAVEIS.has(cir.status)) {
      throw new ConflictException({
        code: 'CIRURGIA_NAO_EDITAVEL',
        message: `Cirurgia em status ${cir.status} não aceita edição.`,
      });
    }

    let salaId: bigint | null = null;
    if (dto.salaUuid !== undefined) {
      const sala = await this.repo.findSalaByUuid(dto.salaUuid);
      if (sala === null) {
        throw new NotFoundException({
          code: 'SALA_NOT_FOUND',
          message: 'Sala cirúrgica não encontrada.',
        });
      }
      salaId = sala.id;
    }

    let procPrincipalId: bigint | null = null;
    let procSecundariosSerialized: unknown = undefined;
    let procSecTouched = false;
    if (
      dto.procedimentoPrincipalUuid !== undefined ||
      dto.procedimentosSecundarios !== undefined
    ) {
      const procUuids: string[] = [];
      if (dto.procedimentoPrincipalUuid !== undefined) {
        procUuids.push(dto.procedimentoPrincipalUuid);
      }
      if (dto.procedimentosSecundarios !== undefined) {
        for (const ps of dto.procedimentosSecundarios) {
          procUuids.push(ps.procedimentoUuid);
        }
      }
      const procs = await this.repo.findProcedimentosByUuids(procUuids);
      const missing = procUuids.filter((u) => !procs.has(u));
      if (missing.length > 0) {
        throw new NotFoundException({
          code: 'PROCEDIMENTO_NOT_FOUND',
          message: `Procedimentos não encontrados: ${missing.join(', ')}`,
        });
      }
      if (dto.procedimentoPrincipalUuid !== undefined) {
        const p = procs.get(dto.procedimentoPrincipalUuid);
        procPrincipalId = p ? p.id : null;
      }
      if (dto.procedimentosSecundarios !== undefined) {
        procSecTouched = true;
        procSecundariosSerialized = dto.procedimentosSecundarios.map((ps) => {
          const proc = procs.get(ps.procedimentoUuid);
          return {
            procedimentoUuid: ps.procedimentoUuid,
            procedimentoId: proc?.id?.toString() ?? null,
            quantidade: ps.quantidade,
          };
        });
      }
    }

    let cirurgiaoId: bigint | null = null;
    if (dto.cirurgiaoUuid !== undefined) {
      const id = await this.repo.findPrestadorIdByUuid(dto.cirurgiaoUuid);
      if (id === null) {
        throw new NotFoundException({
          code: 'CIRURGIAO_NOT_FOUND',
          message: 'Cirurgião não encontrado.',
        });
      }
      cirurgiaoId = id;
    }

    let kitId: bigint | null = null;
    let kitTouched = false;
    if (dto.kitCirurgicoUuid !== undefined) {
      kitId = await this.repo.findKitIdByUuid(dto.kitCirurgicoUuid);
      if (kitId === null) {
        throw new NotFoundException({
          code: 'KIT_NOT_FOUND',
          message: 'Kit cirúrgico não encontrado.',
        });
      }
      kitTouched = true;
    }
    let gabaritoId: bigint | null = null;
    let gabaritoTouched = false;
    if (dto.cadernoGabaritoUuid !== undefined) {
      gabaritoId = await this.repo.findGabaritoIdByUuid(dto.cadernoGabaritoUuid);
      if (gabaritoId === null) {
        throw new NotFoundException({
          code: 'GABARITO_NOT_FOUND',
          message: 'Caderno de gabarito não encontrado.',
        });
      }
      gabaritoTouched = true;
    }

    // Re-checa conflito se sala/data/duração mudou.
    const newSalaId = salaId ?? cir.sala_id;
    const newAgendada = dto.dataHoraAgendada
      ? new Date(dto.dataHoraAgendada)
      : cir.data_hora_agendada;
    const newDuracao =
      dto.duracaoEstimadaMinutos ?? cir.duracao_estimada_minutos ?? 60;
    if (
      dto.salaUuid !== undefined ||
      dto.dataHoraAgendada !== undefined ||
      dto.duracaoEstimadaMinutos !== undefined
    ) {
      if (Number.isNaN(newAgendada.getTime())) {
        throw new BadRequestException({
          code: 'CIRURGIA_DATAHORA_INVALIDA',
          message: 'dataHoraAgendada inválida.',
        });
      }
      const start = newAgendada;
      const end = new Date(start.getTime() + newDuracao * 60 * 1000);
      const conflitos = await this.repo.findSalaConflicts({
        salaId: newSalaId,
        start: start.toISOString(),
        end: end.toISOString(),
        excludeCirurgiaId: cir.id,
      });
      if (conflitos.length > 0) {
        throw new ConflictException({
          code: 'CIRURGIA_SALA_CONFLITO',
          message:
            'Sala já possui cirurgia agendada/em andamento que sobrepõe o intervalo solicitado.',
          detalhes: {
            conflitos: conflitos.map((c) => ({ uuid: c.uuid_externo })),
          },
        });
      }
    }

    // Validar equipe se enviada.
    if (dto.equipe !== undefined) {
      const equipeUuids = dto.equipe.map((e) => e.prestadorUuid);
      const prestadores = await this.repo.findPrestadorIdsByUuids(equipeUuids);
      const missing = equipeUuids.filter((u) => !prestadores.has(u));
      if (missing.length > 0) {
        throw new NotFoundException({
          code: 'PRESTADOR_NOT_FOUND',
          message: `Prestadores não encontrados: ${missing.join(', ')}`,
        });
      }
      await this.repo.deleteEquipe(cir.id);
      for (let i = 0; i < dto.equipe.length; i += 1) {
        const m = dto.equipe[i];
        const p = prestadores.get(m.prestadorUuid);
        if (p === undefined) continue;
        await this.repo.insertEquipe({
          tenantId: ctx.tenantId,
          cirurgiaId: cir.id,
          prestadorId: p.id,
          funcao: m.funcao.toUpperCase(),
          ordem: m.ordem ?? i + 1,
        });
      }
    }

    await this.repo.updateCirurgiaPatch({
      cirurgiaId: cir.id,
      procedimentoPrincipalId: procPrincipalId,
      procedimentosSecundarios: procSecundariosSerialized,
      procedimentosSecundariosTouched: procSecTouched,
      salaId,
      dataHoraAgendada: dto.dataHoraAgendada ?? null,
      duracaoEstimadaMinutos: dto.duracaoEstimadaMinutos ?? null,
      cirurgiaoId,
      tipoAnestesia: dto.tipoAnestesia ?? null,
      tipoAnestesiaTouched: dto.tipoAnestesia !== undefined,
      classificacaoCirurgia: dto.classificacaoCirurgia ?? null,
      kitCirurgicoId: kitId,
      kitCirurgicoTouched: kitTouched,
      cadernoGabaritoId: gabaritoId,
      cadernoGabaritoTouched: gabaritoTouched,
      exigeAutorizacaoConvenio: dto.exigeAutorizacaoConvenio ?? null,
      exigeAutorizacaoConvenioTouched:
        dto.exigeAutorizacaoConvenio !== undefined,
    });

    await this.auditoria.record({
      tabela: 'cirurgias',
      registroId: cir.id,
      operacao: 'U',
      diff: {
        evento: 'cirurgia.atualizada',
        campos: Object.keys(dto),
      },
      finalidade: 'cirurgia.atualizada',
    });

    const updated = await this.repo.findCirurgiaByUuid(uuid);
    if (updated === null) {
      throw new Error('Cirurgia atualizada não encontrada (RLS?).');
    }
    const equipe = await this.repo.findEquipeByCirurgiaId(cir.id);
    const presented = presentCirurgia(updated, equipe);

    this.events.emit('cirurgia.atualizada', {
      tenantId: ctx.tenantId.toString(),
      cirurgia: presented,
    });

    return presented;
  }
}
