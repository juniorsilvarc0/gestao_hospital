/**
 * `GET /v1/centro-cirurgico/mapa?data=YYYY-MM-DD`.
 *
 * Para a `data` informada (default = hoje), traz, agrupado por sala, as
 * cirurgias com `data_hora_agendada` no intervalo [00:00, 24:00) UTC.
 *
 * Cada sala vem mesmo se não tiver cirurgia (UI desenha as colunas).
 */
import { BadRequestException, Injectable } from '@nestjs/common';

import type { GetMapaSalasQueryDto } from '../../dto/list-cirurgias.dto';
import type {
  MapaSalaResponse,
  MapaSalasResponse,
} from '../../dto/responses';
import { CentroCirurgicoRepository } from '../../infrastructure/centro-cirurgico.repository';

@Injectable()
export class GetMapaSalasUseCase {
  constructor(private readonly repo: CentroCirurgicoRepository) {}

  async execute(query: GetMapaSalasQueryDto): Promise<MapaSalasResponse> {
    const dataStr = query.data ?? this.todayUtc();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) {
      throw new BadRequestException({
        code: 'MAPA_DATA_INVALIDA',
        message: 'Parâmetro `data` deve estar no formato YYYY-MM-DD.',
      });
    }
    const inicio = `${dataStr}T00:00:00Z`;
    const fim = `${this.addDay(dataStr)}T00:00:00Z`;

    const { salas, cirurgias } = await this.repo.listMapaSalas({
      dataInicio: inicio,
      dataFim: fim,
    });

    const bySala = new Map<bigint, MapaSalaResponse>();
    for (const s of salas) {
      bySala.set(s.sala_id, {
        salaUuid: s.sala_uuid,
        salaNome: s.sala_nome,
        setor: s.setor,
        cirurgias: [],
      });
    }

    for (const c of cirurgias) {
      let bucket = bySala.get(c.sala_id);
      if (bucket === undefined) {
        // Sala da cirurgia não veio no SELECT (caso de sala desativada).
        bucket = {
          salaUuid: c.sala_uuid,
          salaNome: c.sala_nome,
          setor: null,
          cirurgias: [],
        };
        bySala.set(c.sala_id, bucket);
      }
      const dur = c.duracao_estimada_minutos ?? 60;
      const fimPrevisto = new Date(
        c.data_hora_agendada.getTime() + dur * 60 * 1000,
      );
      bucket.cirurgias.push({
        uuid: c.uuid_externo,
        status: c.status,
        pacienteUuid: c.paciente_uuid,
        pacienteNome: c.paciente_nome,
        procedimentoPrincipalUuid: c.procedimento_principal_uuid,
        procedimentoPrincipalNome: c.procedimento_principal_nome,
        cirurgiaoUuid: c.cirurgiao_uuid,
        cirurgiaoNome: c.cirurgiao_nome,
        horaInicio: c.data_hora_agendada.toISOString(),
        horaFim: fimPrevisto.toISOString(),
        horaInicioReal: c.data_hora_inicio
          ? c.data_hora_inicio.toISOString()
          : null,
        horaFimReal: c.data_hora_fim ? c.data_hora_fim.toISOString() : null,
        classificacao: c.classificacao_cirurgia,
        tipoAnestesia: c.tipo_anestesia,
      });
    }

    return {
      data: dataStr,
      salas: Array.from(bySala.values()).sort((a, b) =>
        a.salaNome.localeCompare(b.salaNome, 'pt-BR'),
      ),
    };
  }

  private todayUtc(): string {
    const d = new Date();
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  private addDay(yyyymmdd: string): string {
    const [y, m, d] = yyyymmdd.split('-').map((s) => Number(s));
    const dt = new Date(Date.UTC(y, m - 1, d + 1));
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }
}
