/**
 * `GET /v1/kits-cirurgicos` — listagem paginada com filtros opcionais.
 */
import { Injectable } from '@nestjs/common';

import type { KitsListResponse } from '../../dto/responses';
import { CentroCirurgicoRepository } from '../../infrastructure/centro-cirurgico.repository';
import { presentKit } from './kit.presenter';

export interface ListKitsArgs {
  ativo?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class ListKitsUseCase {
  constructor(private readonly repo: CentroCirurgicoRepository) {}

  async execute(args: ListKitsArgs): Promise<KitsListResponse> {
    const page = args.page ?? 1;
    const pageSize = args.pageSize ?? 50;
    const { rows, total } = await this.repo.listKits({
      ativo: args.ativo,
      search: args.search,
      page,
      pageSize,
    });
    const ids = rows.map((r) => r.id);
    const itensByKit = await this.repo.listKitItensForKitIds(ids);
    const data = rows.map((r) =>
      presentKit(r, itensByKit.get(r.id) ?? []),
    );
    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }
}
