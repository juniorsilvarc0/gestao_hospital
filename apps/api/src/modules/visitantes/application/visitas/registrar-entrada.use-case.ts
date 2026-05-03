/**
 * `POST /v1/visitas` — registra entrada de visitante (RN-VIS-01..04).
 *
 * Fluxo:
 *   1. Pré-check: visitante existe e não está bloqueado (RN-VIS-03).
 *      A trigger DB `tg_visita_valida_visitante` é a defesa final, mas
 *      preferimos 422 amigável aqui.
 *   2. Localizar atendimento ativo do paciente (status preferencial
 *      INTERNADO; fallbacks ambulatoriais aceitos). Sem atendimento →
 *      422.
 *   3. RN-VIS-04: se setor é UTI, bloquear (cadastro nominal vai para
 *      Fase 13).
 *   4. RN-VIS-02: se atendimento tem `leito_id`, contar visitas ativas
 *      no leito e validar contra o limite por `tipo_acomodacao`.
 *   5. INSERT visita (porteiro_id = ctx.userId).
 *   6. Auditoria.
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import {
  atingiuLimite,
  exigeAutorizacaoUti,
  limiteSimultaneos,
} from '../../domain/limite-visitas';
import type { RegistrarVisitaDto } from '../../dto/registrar-visita.dto';
import type { VisitaResponse } from '../../dto/responses';
import { VisitantesRepository } from '../../infrastructure/visitantes.repository';
import { presentVisita } from './visita.presenter';

@Injectable()
export class RegistrarEntradaUseCase {
  constructor(
    private readonly repo: VisitantesRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(dto: RegistrarVisitaDto): Promise<VisitaResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('RegistrarEntradaUseCase requires request context.');
    }

    // 1. Visitante existe e não bloqueado.
    const visitante = await this.repo.findVisitanteByUuid(dto.visitanteUuid);
    if (visitante === null) {
      throw new NotFoundException({
        code: 'VISITANTE_NOT_FOUND',
        message: 'Visitante não encontrado.',
      });
    }
    if (visitante.bloqueado) {
      throw new UnprocessableEntityException({
        code: 'VISITANTE_BLOQUEADO',
        message: `Visitante bloqueado: ${
          visitante.motivo_bloqueio ?? 'motivo não registrado'
        }.`,
      });
    }

    // 2. Atendimento ativo do paciente.
    const atendimento = await this.repo.findAtendimentoAtivoDoPaciente(
      dto.pacienteUuid,
    );
    if (atendimento === null) {
      throw new UnprocessableEntityException({
        code: 'PACIENTE_SEM_ATENDIMENTO_ATIVO',
        message:
          'Paciente sem atendimento ativo — não é possível registrar visita.',
      });
    }

    // 3. RN-VIS-04: UTI exige cadastro nominal (Fase 13).
    if (exigeAutorizacaoUti(atendimento.setorTipo)) {
      throw new UnprocessableEntityException({
        code: 'VISITA_UTI_EXIGE_AUTORIZACAO',
        message:
          'Visita em UTI exige autorização específica. Cadastro nominal pendente (Fase 13).',
      });
    }

    // 4. RN-VIS-02: limite por leito (somente se houver leito atribuído).
    if (atendimento.leitoId !== null) {
      const ativas = await this.repo.countVisitasAtivasNoLeito(
        atendimento.leitoId,
      );
      if (atingiuLimite(atendimento.leitoTipoAcomodacao, ativas)) {
        const limite = limiteSimultaneos(atendimento.leitoTipoAcomodacao);
        throw new UnprocessableEntityException({
          code: 'VISITAS_LEITO_LIMITE_ATINGIDO',
          message: `Limite de ${limite} visitantes simultâneos atingido para o leito.`,
        });
      }
    }

    // 5. INSERT — trigger DB rejeita visitante bloqueado (defesa final).
    let inserted: { id: bigint; uuidExterno: string };
    try {
      inserted = await this.repo.insertVisita({
        tenantId: ctx.tenantId,
        visitanteId: visitante.id,
        pacienteId: atendimento.pacienteId,
        atendimentoId: atendimento.atendimentoId,
        leitoId: atendimento.leitoId,
        setorId: atendimento.setorId,
        porteiroId: ctx.userId,
        observacao: dto.observacao ?? null,
      });
    } catch (err: unknown) {
      // Se a trigger DB acertar primeiro, remapeamos para o mesmo
      // código de erro do pré-check.
      if (
        err instanceof Error &&
        err.message.toLowerCase().includes('bloqueado')
      ) {
        throw new UnprocessableEntityException({
          code: 'VISITANTE_BLOQUEADO',
          message: 'Visitante bloqueado.',
        });
      }
      throw err;
    }

    await this.auditoria.record({
      tabela: 'visitas',
      registroId: inserted.id,
      operacao: 'I',
      diff: {
        evento: 'visita.entrada_registrada',
        visitante_uuid: visitante.uuid_externo,
        paciente_uuid: dto.pacienteUuid,
        atendimento_id: atendimento.atendimentoId.toString(),
        leito_id:
          atendimento.leitoId === null ? null : atendimento.leitoId.toString(),
        setor_tipo: atendimento.setorTipo,
      },
      finalidade: 'visita.entrada_registrada',
    });

    const row = await this.repo.findVisitaByUuid(inserted.uuidExterno);
    if (row === null) {
      throw new Error('Visita criada não encontrada (RLS?).');
    }
    return presentVisita(row);
  }
}
