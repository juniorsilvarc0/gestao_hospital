/**
 * `GET /v1/cadernos-gabaritos`.
 */
import { Injectable } from '@nestjs/common';

import type { GabaritosListResponse } from '../../dto/responses';
import { CentroCirurgicoRepository } from '../../infrastructure/centro-cirurgico.repository';
import { presentGabarito } from './gabarito.presenter';

export interface ListGabaritosArgs {
  procedimentoPrincipalUuid?: string;
  cirurgiaoUuid?: string;
  ativo?: boolean;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class ListGabaritosUseCase {
  constructor(private readonly repo: CentroCirurgicoRepository) {}

  async execute(args: ListGabaritosArgs): Promise<GabaritosListResponse> {
    const page = args.page ?? 1;
    const pageSize = args.pageSize ?? 50;

    let procPrincipalId: bigint | undefined;
    if (args.procedimentoPrincipalUuid !== undefined) {
      const map = await this.repo.findProcedimentosByUuids([
        args.procedimentoPrincipalUuid,
      ]);
      const proc = map.get(args.procedimentoPrincipalUuid);
      if (proc === undefined) return emptyResp(page, pageSize);
      procPrincipalId = proc.id;
    }
    let cirurgiaoId: bigint | undefined;
    if (args.cirurgiaoUuid !== undefined) {
      const id = await this.repo.findPrestadorIdByUuid(args.cirurgiaoUuid);
      if (id === null) return emptyResp(page, pageSize);
      cirurgiaoId = id;
    }

    const { rows, total } = await this.repo.listGabaritos({
      procedimentoPrincipalId: procPrincipalId,
      cirurgiaoId,
      ativo: args.ativo,
      page,
      pageSize,
    });
    const data: GabaritosListResponse['data'] = [];
    for (const r of rows) {
      const itens = await this.repo.findGabaritoItensByCadernoId(r.id);
      data.push(presentGabarito(r, itens));
    }
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

function emptyResp(page: number, pageSize: number): GabaritosListResponse {
  return { data: [], meta: { page, pageSize, total: 0, totalPages: 1 } };
}
