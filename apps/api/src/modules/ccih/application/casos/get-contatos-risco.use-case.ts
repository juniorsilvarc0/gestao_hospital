/**
 * `GET /v1/ccih/casos/{uuid}/contatos-risco` — RN-CCI-01.
 *
 * Identifica pacientes que estiveram no mesmo setor e/ou leito do caso
 * dentro da janela [data_diagnostico - 14 dias, data_diagnostico] e
 * portanto podem ter sido expostos. Lista útil para a CCIH avaliar
 * surto / vigilância ativa.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import type {
  ContatoRiscoEntry,
  ContatosRiscoResponse,
} from '../../dto/responses';
import { CcihRepository } from '../../infrastructure/ccih.repository';

const JANELA_DIAS = 14;

function toIso(d: Date): string {
  return d.toISOString();
}

@Injectable()
export class GetContatosRiscoUseCase {
  constructor(private readonly repo: CcihRepository) {}

  async execute(uuid: string): Promise<ContatosRiscoResponse> {
    const caso = await this.repo.findCasoByUuid(uuid);
    if (caso === null) {
      throw new NotFoundException({
        code: 'CCIH_CASO_NOT_FOUND',
        message: 'Caso não encontrado.',
      });
    }

    // Janela: 14 dias antes até a data de diagnóstico (inclusive).
    const fim = new Date(caso.data_diagnostico);
    // 23:59:59 UTC do dia do diagnóstico.
    const fimUtc = new Date(
      Date.UTC(
        fim.getUTCFullYear(),
        fim.getUTCMonth(),
        fim.getUTCDate(),
        23,
        59,
        59,
      ),
    );
    const inicio = new Date(
      fimUtc.getTime() - JANELA_DIAS * 24 * 60 * 60 * 1000,
    );

    const contatos = await this.repo.findContatosRisco({
      excludePacienteId: caso.paciente_id,
      setorId: caso.setor_id,
      leitoId: caso.leito_id,
      inicioIso: toIso(inicio),
      fimIso: toIso(fimUtc),
    });

    const result: ContatoRiscoEntry[] = contatos.map((c) => ({
      pacienteUuid: c.pacienteUuid,
      pacienteNome: c.pacienteNome,
      atendimentoUuid: c.atendimentoUuid,
      setorUuid: c.setorUuid,
      setorNome: c.setorNome,
      leitoUuid: c.leitoUuid,
      leitoIdentificacao: c.leitoCodigo,
      dataInicio: c.dataInicio === null ? null : c.dataInicio.toISOString(),
      dataFim: c.dataFim === null ? null : c.dataFim.toISOString(),
      motivo: c.motivo,
    }));

    return {
      casoUuid: caso.uuid_externo,
      janelaInicio: toIso(inicio),
      janelaFim: toIso(fimUtc),
      contatos: result,
    };
  }
}
