/**
 * `GET /v1/contas/{uuid}/espelho` — gera espelho da conta.
 *
 * Implementação atual: JSON completo (conta + itens). PDF foi
 * postergado para a Fase 13 (Hardening / Go-live), quando teremos a
 * infra Puppeteer pronta. O controller retorna o header
 * `X-Format-Note: PDF deferred to Phase 13` para sinalizar.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import type { EspelhoResponse } from '../../dto/responses';
import { ContasRepository } from '../../infrastructure/contas.repository';
import { presentConta, presentContaItem } from './conta.presenter';

@Injectable()
export class GerarEspelhoUseCase {
  constructor(private readonly repo: ContasRepository) {}

  async execute(contaUuid: string): Promise<EspelhoResponse> {
    const row = await this.repo.findContaByUuid(contaUuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'CONTA_NOT_FOUND',
        message: 'Conta não encontrada.',
      });
    }
    const itens = await this.repo.findItensByContaId(row.id);
    return {
      conta: presentConta(row),
      itens: itens.map(presentContaItem),
    };
  }
}
