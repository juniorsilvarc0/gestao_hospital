/**
 * `GET /v1/kits-cirurgicos/{uuid}`.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import type { KitResponse } from '../../dto/responses';
import { CentroCirurgicoRepository } from '../../infrastructure/centro-cirurgico.repository';
import { presentKit } from './kit.presenter';

@Injectable()
export class GetKitUseCase {
  constructor(private readonly repo: CentroCirurgicoRepository) {}

  async execute(uuid: string): Promise<KitResponse> {
    const kit = await this.repo.findKitByUuid(uuid);
    if (kit === null) {
      throw new NotFoundException({
        code: 'KIT_NOT_FOUND',
        message: 'Kit cirúrgico não encontrado.',
      });
    }
    const itens = await this.repo.findKitItensByKitId(kit.id);
    return presentKit(kit, itens);
  }
}
