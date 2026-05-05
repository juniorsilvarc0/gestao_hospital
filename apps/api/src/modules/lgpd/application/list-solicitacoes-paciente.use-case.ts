/**
 * Use case: `GET /v1/lgpd/solicitacoes/me` — solicitações LGPD do
 * paciente autenticado (portal-paciente / Fase 11+).
 *
 * Resolve `paciente_id` via JOIN com `usuarios.paciente_id` a partir do
 * userId no `RequestContextStorage`. Se o usuário autenticado não for
 * do tipo PACIENTE (ou estiver sem vínculo), devolvemos lista vazia em
 * vez de 403 — esse endpoint é meramente uma "view minha" e a ausência
 * de paciente vinculado significa "não há nada meu". 403 ficaria
 * ambíguo para o frontend (tela de erro vs. lista vazia).
 */
import { Injectable } from '@nestjs/common';

import { RequestContextStorage } from '../../../common/context/request-context';
import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import type { ListSolicitacoesQueryDto } from '../dto/list-solicitacoes-query.dto';
import type { ListSolicitacoesResponse } from '../dto/responses';
import { LgpdRepository } from '../infrastructure/lgpd.repository';
import { presentSolicitacao } from './solicitacao.presenter';

@Injectable()
export class ListSolicitacoesPacienteUseCase {
  constructor(
    private readonly repo: LgpdRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(
    query: ListSolicitacoesQueryDto,
  ): Promise<ListSolicitacoesResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const empty = {
      data: [] as ListSolicitacoesResponse['data'],
      meta: { page, pageSize, total: 0, totalPages: 0 },
    };

    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      return empty;
    }

    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ paciente_id: bigint | null }[]>`
      SELECT u.paciente_id
        FROM usuarios u
       WHERE u.id = ${ctx.userId}::bigint AND u.deleted_at IS NULL
       LIMIT 1
    `;
    if (rows.length === 0 || rows[0].paciente_id === null) {
      return empty;
    }
    const pacienteId = rows[0].paciente_id;

    const { rows: solicitacoes, total } =
      await this.repo.listSolicitacoesByPaciente(pacienteId, page, pageSize);
    return {
      data: solicitacoes.map(presentSolicitacao),
      meta: {
        page,
        pageSize,
        total,
        totalPages: pageSize === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }
}
