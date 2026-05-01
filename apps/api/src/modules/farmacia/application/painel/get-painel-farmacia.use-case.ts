/**
 * `GET /v1/farmacia/painel` (RN-FAR-08).
 *
 * Snapshot do painel da farmácia: agrupa dispensações em status
 * `PENDENTE` ou `SEPARADA` por turno (MANHA/TARDE/NOITE/MADRUGADA).
 * `DISPENSADA` some do painel — fica disponível só pelos endpoints de
 * histórico (não cobertos nesta fase).
 *
 * O cliente pode filtrar por turno via query (`?turno=MANHA`); por
 * default todos os turnos vêm.
 *
 * RLS isola por tenant; o use case **não** faz checagem por setor (o
 * painel é geralmente operado pela farmácia central). Hospitais com
 * farmácia satélite podem evoluir para filtro por `setor_destino_id`
 * em iteração futura.
 */
import { Injectable } from '@nestjs/common';

import {
  DISPENSACAO_TURNOS,
  type DispensacaoStatus,
  type DispensacaoTurno,
} from '../../domain/dispensacao';
import type {
  ListPainelQueryDto,
  PainelFarmaciaResponse,
  PainelTurnoBucket,
} from '../../dto/responses';
import { FarmaciaRepository } from '../../infrastructure/farmacia.repository';
import { presentDispensacao } from '../dispensacoes/dispensacao.presenter';

const PAINEL_DEFAULT_STATUSES: DispensacaoStatus[] = ['PENDENTE', 'SEPARADA'];

@Injectable()
export class GetPainelFarmaciaUseCase {
  constructor(private readonly repo: FarmaciaRepository) {}

  async execute(query: ListPainelQueryDto): Promise<PainelFarmaciaResponse> {
    const statuses =
      query.status !== undefined && query.status.length > 0
        ? query.status
        : PAINEL_DEFAULT_STATUSES;
    const limit = query.limit ?? 200;

    const rows = await this.repo.listForPainel({
      statuses,
      turno: query.turno,
      limit,
    });

    // Buckets por turno — ordem fixa para a UI.
    const bucketsMap = new Map<DispensacaoTurno, PainelTurnoBucket>();
    for (const turno of DISPENSACAO_TURNOS) {
      bucketsMap.set(turno, {
        turno,
        quantidade: 0,
        pendentes: 0,
        separadas: 0,
        dispensacoes: [],
      });
    }

    for (const row of rows) {
      const turno = (row.turno ?? 'MANHA') as DispensacaoTurno;
      const bucket = bucketsMap.get(turno);
      if (bucket === undefined) continue;
      const itens = await this.repo.findItensByDispensacaoId(
        row.id,
        row.data_hora,
      );
      bucket.dispensacoes.push(presentDispensacao(row, itens));
      bucket.quantidade += 1;
      if (row.status === 'PENDENTE') bucket.pendentes += 1;
      else if (row.status === 'SEPARADA') bucket.separadas += 1;
    }

    const buckets = Array.from(bucketsMap.values()).filter(
      (b) =>
        b.quantidade > 0 ||
        // Sempre devolve buckets vazios para a UI desenhar a coluna.
        true,
    );

    return {
      geradoEm: new Date().toISOString(),
      total: rows.length,
      buckets,
    };
  }
}
