/**
 * `GET /v1/same/emprestimos/atrasados` — RN-SAM-02.
 *
 * Atua como "self-healing" do status: antes de listar, atualiza
 * empréstimos `ATIVO` cujo prazo já venceu para `ATRASADO`. Em seguida
 * lista todos os atrasados (não devolvidos com prazo vencido) — sem
 * paginação alta porque costumam ser poucos no dia a dia.
 */
import { Injectable } from '@nestjs/common';

import type { ListEmprestimosResponse } from '../../dto/responses';
import { SameRepository } from '../../infrastructure/same.repository';
import { presentEmprestimo } from './emprestimo.presenter';

@Injectable()
export class ListAtrasadosUseCase {
  constructor(private readonly repo: SameRepository) {}

  async execute(): Promise<ListEmprestimosResponse> {
    // Self-healing: marca como ATRASADO os ATIVO com prazo vencido.
    await this.repo.marcarAtrasadosBatch();

    const { rows, total } = await this.repo.listEmprestimos({
      apenasAtrasados: true,
      page: 1,
      pageSize: 200,
    });

    return {
      data: rows.map((r) => presentEmprestimo(r)),
      meta: {
        page: 1,
        pageSize: 200,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / 200),
      },
    };
  }
}
