/**
 * `POST /v1/cirurgias` — agendamento (RN-CC-01, RN-CC-02).
 *
 * Validações:
 *   1. Atendimento existe e não está cancelado.
 *   2. Sala existe.
 *   3. Procedimento principal existe; secundários (se informados) também.
 *   4. Cirurgião + equipe existem como prestadores ativos; equipe tem
 *      pelo menos 1 CIRURGIAO (RN-CC-01).
 *   5. Kit cirúrgico / caderno de gabarito (se informados) existem.
 *   6. RN-CC-01: pré-checagem de conflito de sala — retorna 409
 *      estruturado se houver sobreposição [start, end) com cirurgia
 *      já agendada/em andamento na mesma sala.
 *
 * Após validar, INSERT cabeçalho + N membros da equipe, audita
 * `cirurgia.agendada` e emite evento de domínio.
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
import { temCirurgiao } from '../../domain/equipe-cirurgica';
import type { CreateCirurgiaDto } from '../../dto/create-cirurgia.dto';
import type { CirurgiaResponse } from '../../dto/responses';
import { CentroCirurgicoRepository } from '../../infrastructure/centro-cirurgico.repository';
import { presentCirurgia } from './cirurgia.presenter';

@Injectable()
export class CreateCirurgiaUseCase {
  constructor(
    private readonly repo: CentroCirurgicoRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(dto: CreateCirurgiaDto): Promise<CirurgiaResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('CreateCirurgiaUseCase requires a request context.');
    }

    if (Number.isNaN(Date.parse(dto.dataHoraAgendada))) {
      throw new BadRequestException({
        code: 'CIRURGIA_DATAHORA_INVALIDA',
        message: 'dataHoraAgendada inválida.',
      });
    }
    if (dto.duracaoEstimadaMinutos < 1) {
      throw new BadRequestException({
        code: 'CIRURGIA_DURACAO_INVALIDA',
        message: 'duracaoEstimadaMinutos deve ser >= 1.',
      });
    }
    if (!temCirurgiao(dto.equipe)) {
      throw new BadRequestException({
        code: 'EQUIPE_SEM_CIRURGIAO',
        message:
          'Equipe deve conter pelo menos 1 membro com função CIRURGIAO (RN-CC-01).',
      });
    }

    // 1. Atendimento.
    const atend = await this.repo.findAtendimentoBasics(dto.atendimentoUuid);
    if (atend === null) {
      throw new NotFoundException({
        code: 'ATENDIMENTO_NOT_FOUND',
        message: 'Atendimento não encontrado.',
      });
    }

    // 2. Sala.
    const sala = await this.repo.findSalaByUuid(dto.salaUuid);
    if (sala === null) {
      throw new NotFoundException({
        code: 'SALA_NOT_FOUND',
        message: 'Sala cirúrgica não encontrada ou inativa.',
      });
    }

    // 3. Procedimentos.
    const procUuids = [
      dto.procedimentoPrincipalUuid,
      ...(dto.procedimentosSecundarios ?? []).map((p) => p.procedimentoUuid),
    ];
    const procs = await this.repo.findProcedimentosByUuids(procUuids);
    const missingProc = procUuids.filter((u) => !procs.has(u));
    if (missingProc.length > 0) {
      throw new NotFoundException({
        code: 'PROCEDIMENTO_NOT_FOUND',
        message: `Procedimentos não encontrados: ${missingProc.join(', ')}`,
      });
    }
    const procPrincipal = procs.get(dto.procedimentoPrincipalUuid);
    if (procPrincipal === undefined) {
      throw new NotFoundException({
        code: 'PROCEDIMENTO_NOT_FOUND',
        message: 'Procedimento principal não encontrado.',
      });
    }

    // 4. Cirurgião + equipe.
    const equipeUuids = [
      dto.cirurgiaoUuid,
      ...dto.equipe.map((e) => e.prestadorUuid),
    ];
    const prestadores = await this.repo.findPrestadorIdsByUuids(equipeUuids);
    const missingPrest = equipeUuids.filter((u) => !prestadores.has(u));
    if (missingPrest.length > 0) {
      throw new NotFoundException({
        code: 'PRESTADOR_NOT_FOUND',
        message: `Prestadores não encontrados: ${missingPrest.join(', ')}`,
      });
    }
    const cirurgiao = prestadores.get(dto.cirurgiaoUuid);
    if (cirurgiao === undefined) {
      throw new NotFoundException({
        code: 'CIRURGIAO_NOT_FOUND',
        message: 'Cirurgião não encontrado.',
      });
    }

    // 5. Kit / Gabarito.
    let kitId: bigint | null = null;
    if (dto.kitCirurgicoUuid !== undefined) {
      kitId = await this.repo.findKitIdByUuid(dto.kitCirurgicoUuid);
      if (kitId === null) {
        throw new NotFoundException({
          code: 'KIT_NOT_FOUND',
          message: 'Kit cirúrgico não encontrado.',
        });
      }
    }
    let gabaritoId: bigint | null = null;
    if (dto.cadernoGabaritoUuid !== undefined) {
      gabaritoId = await this.repo.findGabaritoIdByUuid(
        dto.cadernoGabaritoUuid,
      );
      if (gabaritoId === null) {
        throw new NotFoundException({
          code: 'GABARITO_NOT_FOUND',
          message: 'Caderno de gabarito não encontrado.',
        });
      }
    }

    // 6. Pré-checagem de conflito (RN-CC-01).
    const start = new Date(dto.dataHoraAgendada);
    const end = new Date(
      start.getTime() + dto.duracaoEstimadaMinutos * 60 * 1000,
    );
    const conflitos = await this.repo.findSalaConflicts({
      salaId: sala.id,
      start: start.toISOString(),
      end: end.toISOString(),
    });
    if (conflitos.length > 0) {
      throw new ConflictException({
        code: 'CIRURGIA_SALA_CONFLITO',
        message:
          'Sala já possui cirurgia agendada/em andamento que sobrepõe o intervalo solicitado (RN-CC-01).',
        detalhes: {
          conflitos: conflitos.map((c) => ({ uuid: c.uuid_externo })),
        },
      });
    }

    // 7. INSERT.
    const procSecundariosForJson = (dto.procedimentosSecundarios ?? []).map(
      (p) => {
        const proc = procs.get(p.procedimentoUuid);
        return {
          procedimentoUuid: p.procedimentoUuid,
          procedimentoId: proc?.id?.toString() ?? null,
          quantidade: p.quantidade,
        };
      },
    );

    const inserted = await this.repo.insertCirurgia({
      tenantId: ctx.tenantId,
      atendimentoId: atend.id,
      pacienteId: atend.pacienteId,
      procedimentoPrincipalId: procPrincipal.id,
      procedimentosSecundarios: procSecundariosForJson,
      salaId: sala.id,
      dataHoraAgendada: dto.dataHoraAgendada,
      duracaoEstimadaMinutos: dto.duracaoEstimadaMinutos,
      cirurgiaoId: cirurgiao.id,
      tipoAnestesia: dto.tipoAnestesia ?? null,
      classificacaoCirurgia: dto.classificacaoCirurgia,
      exigeAutorizacaoConvenio: dto.exigeAutorizacaoConvenio === true,
      kitCirurgicoId: kitId,
      cadernoGabaritoId: gabaritoId,
      userId: ctx.userId,
    });

    for (let i = 0; i < dto.equipe.length; i += 1) {
      const m = dto.equipe[i];
      const p = prestadores.get(m.prestadorUuid);
      if (p === undefined) continue;
      await this.repo.insertEquipe({
        tenantId: ctx.tenantId,
        cirurgiaId: inserted.id,
        prestadorId: p.id,
        funcao: m.funcao.toUpperCase(),
        ordem: m.ordem ?? i + 1,
      });
    }

    await this.auditoria.record({
      tabela: 'cirurgias',
      registroId: inserted.id,
      operacao: 'I',
      diff: {
        evento: 'cirurgia.agendada',
        atendimento_id: atend.id.toString(),
        sala_id: sala.id.toString(),
        cirurgiao_id: cirurgiao.id.toString(),
        classificacao: dto.classificacaoCirurgia,
        n_equipe: dto.equipe.length,
      },
      finalidade: 'cirurgia.agendada',
    });

    const created = await this.repo.findCirurgiaByUuid(inserted.uuidExterno);
    if (created === null) {
      throw new Error('Cirurgia recém-criada não encontrada (RLS?).');
    }
    const equipe = await this.repo.findEquipeByCirurgiaId(inserted.id);
    const presented = presentCirurgia(created, equipe);

    this.events.emit('cirurgia.agendada', {
      tenantId: ctx.tenantId.toString(),
      cirurgia: presented,
    });

    return presented;
  }
}
