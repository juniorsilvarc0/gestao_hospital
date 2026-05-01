/**
 * `POST /v1/atendimentos/:atendUuid/sinais-vitais` — registra um snapshot
 * de sinais vitais (RN-PEP-04 / RN-ATE-04).
 *
 * Fluxo:
 *   1. Resolve atendimento (não pode estar terminado).
 *   2. Resolve `registrado_por` via prestador do usuário logado (se
 *      houver vínculo) — caso contrário, apenas usa `userId` por meio de
 *      mapping conservador.
 *   3. Roda `validarSinaisVitaisPep` — se houver valores fora da faixa e
 *      `valorConfirmado !== true`, devolve 422 com lista de campos.
 *   4. INSERT em `sinais_vitais` (tabela particionada — `data_hora`
 *      default = now()).
 *   5. Audit `sinais_vitais.registrados`.
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { RegistrarSinaisDto } from '../../dto/registrar-sinais.dto';
import { PepRepository } from '../../infrastructure/pep.repository';
import {
  presentSinaisVitais,
  type SinaisVitaisResponse,
} from './sinais-vitais.presenter';
import { validarSinaisVitaisPep } from './sinais-vitais.validator';

const TERMINAL = new Set(['ALTA', 'CANCELADO', 'NAO_COMPARECEU']);

@Injectable()
export class RegistrarSinaisVitaisUseCase {
  constructor(
    private readonly repo: PepRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    atendimentoUuid: string,
    dto: RegistrarSinaisDto,
  ): Promise<SinaisVitaisResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('RegistrarSinaisVitaisUseCase requires a request context.');
    }

    const atend = await this.repo.findAtendimentoBasic(atendimentoUuid);
    if (atend === null) {
      throw new NotFoundException({
        code: 'ATENDIMENTO_NOT_FOUND',
        message: 'Atendimento não encontrado.',
      });
    }
    if (TERMINAL.has(atend.status)) {
      throw new ConflictException({
        code: 'ATENDIMENTO_ESTADO_TERMINAL',
        message: `Não é permitido registrar sinais em atendimento ${atend.status}.`,
      });
    }

    // Validação fisiológica.
    const fora = validarSinaisVitaisPep({
      paSistolica: dto.paSistolica,
      paDiastolica: dto.paDiastolica,
      fc: dto.fc,
      fr: dto.fr,
      temperatura: dto.temperatura,
      satO2: dto.satO2,
      glicemia: dto.glicemia,
      pesoKg: dto.pesoKg,
      alturaCm: dto.alturaCm,
      dorEva: dto.dorEva,
    });
    if (fora.length > 0 && dto.valorConfirmado !== true) {
      throw new UnprocessableEntityException({
        code: 'SINAIS_VITAIS_FORA_FAIXA',
        message:
          'Valores fora da faixa fisiológica. Confirme com `valorConfirmado=true` + `justificativa`.',
        detalhes: fora,
      });
    }

    // Resolução de "registrado_por": preferimos prestador, senão usuário.
    const prestadorId = await this.repo.findPrestadorIdByUser(ctx.userId);
    const registradoPor = prestadorId ?? ctx.userId;

    const dataHora = dto.dataHora !== undefined
      ? new Date(dto.dataHora)
      : new Date();
    if (Number.isNaN(dataHora.getTime())) {
      throw new UnprocessableEntityException({
        code: 'SINAIS_VITAIS_DATA_INVALIDA',
        message: 'dataHora inválida.',
      });
    }

    const inserted = await this.repo.insertSinaisVitais({
      tenantId: ctx.tenantId,
      atendimentoId: atend.id,
      pacienteId: atend.paciente_id,
      registradoPor,
      dataHora,
      paSistolica: dto.paSistolica ?? null,
      paDiastolica: dto.paDiastolica ?? null,
      fc: dto.fc ?? null,
      fr: dto.fr ?? null,
      temperatura: dto.temperatura ?? null,
      satO2: dto.satO2 ?? null,
      glicemia: dto.glicemia ?? null,
      pesoKg: dto.pesoKg ?? null,
      alturaCm: dto.alturaCm ?? null,
      dorEva: dto.dorEva ?? null,
      observacao: dto.observacao ?? null,
      valorConfirmado: dto.valorConfirmado === true,
      justificativa: dto.justificativa ?? null,
    });

    await this.auditoria.record({
      tabela: 'sinais_vitais',
      registroId: inserted.id,
      operacao: 'I',
      diff: {
        evento: 'sinais_vitais.registrados',
        atendimento_id: atend.id.toString(),
        // PHI-safe: não logamos valores individuais, apenas presenças.
        campos: Object.entries({
          pa: dto.paSistolica !== undefined,
          fc: dto.fc !== undefined,
          fr: dto.fr !== undefined,
          temp: dto.temperatura !== undefined,
          spo2: dto.satO2 !== undefined,
          glic: dto.glicemia !== undefined,
          peso: dto.pesoKg !== undefined,
          eva: dto.dorEva !== undefined,
        })
          .filter(([, v]) => v)
          .map(([k]) => k),
        valor_confirmado: dto.valorConfirmado === true,
      },
      finalidade: 'sinais_vitais.registrados',
    });

    // Recuperar registro completo (inclui UUIDs para apresentar).
    const list = await this.repo.listSinaisVitais(atend.id, 1, 1);
    const row = list.rows.find((r) => r.uuid_externo === inserted.uuid_externo);
    if (row === undefined) {
      throw new Error('Sinais vitais inseridos mas não encontrados.');
    }
    return presentSinaisVitais(row);
  }
}
