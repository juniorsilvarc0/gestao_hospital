/**
 * `GET /v1/farmacia/livro-controlados` — listagem paginada do livro.
 *
 * Filtros suportados: procedimento (UUID), lote, tipoMovimento.
 * RLS isola por tenant.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import type {
  ListLivroQueryDto,
  LivroControladosListResponse,
} from '../../dto/responses';
import { FarmaciaRepository } from '../../infrastructure/farmacia.repository';
import { presentLivroLinha } from '../dispensacoes/dispensacao.presenter';

@Injectable()
export class ListLivroControladosUseCase {
  constructor(private readonly repo: FarmaciaRepository) {}

  async execute(
    query: ListLivroQueryDto,
  ): Promise<LivroControladosListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    let procedimentoId: bigint | undefined;
    if (query.procedimentoUuid !== undefined) {
      const procs = await this.repo.findProcedimentosByUuids([
        query.procedimentoUuid,
      ]);
      const proc = procs.get(query.procedimentoUuid);
      if (proc === undefined) {
        throw new NotFoundException({
          code: 'PROCEDIMENTO_NOT_FOUND',
          message: 'Procedimento não encontrado.',
        });
      }
      procedimentoId = proc.id;
    }

    const { rows, total } = await this.repo.listLivro({
      procedimentoId,
      lote: query.lote,
      tipoMovimento: query.tipoMovimento,
      page,
      pageSize,
    });

    const data = rows.map(presentLivroLinha);
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
    return {
      data,
      meta: { page, pageSize, total, totalPages },
    };
  }
}
