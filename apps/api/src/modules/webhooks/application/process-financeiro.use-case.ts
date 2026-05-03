/**
 * Processor para webhooks `FINANCEIRO` e `GATEWAY_PAGAMENTO`.
 *
 * Marca a conta como `PAGA` se ainda não estiver. Idempotente:
 *   - Já PAGA → no-op + sucesso (devolve "ja_paga": true).
 *   - CANCELADA → ignora com warning.
 *   - Outros estados → marca PAGA + atualiza valor_pago.
 *
 * O detalhe de tesouraria (lançamentos contábeis) é responsabilidade
 * do módulo financeiro externo (RM/Fluxus) — aqui apenas o status da
 * conta no HMS-BR.
 */
import { Injectable } from '@nestjs/common';

import type { WebhookFinanceiroDto } from '../dto/financeiro.dto';
import { WebhooksRepository } from '../infrastructure/webhooks.repository';

interface ProcessFinanceiroResult {
  contaUuid: string | null;
  jaPaga: boolean;
  ignorado: boolean;
  motivo?: string;
}

@Injectable()
export class ProcessFinanceiroUseCase {
  constructor(private readonly repo: WebhooksRepository) {}

  async execute(
    _tenantId: bigint,
    payload: unknown,
  ): Promise<ProcessFinanceiroResult> {
    const dto = payload as WebhookFinanceiroDto;
    const contaId = await this.repo.findContaIdByNumero(dto.contaNumero);
    if (contaId === null) {
      return {
        contaUuid: null,
        jaPaga: false,
        ignorado: true,
        motivo: 'Conta não encontrada por numero_conta.',
      };
    }
    const atual = await this.repo.findContaStatusById(contaId);
    if (atual === null) {
      return {
        contaUuid: null,
        jaPaga: false,
        ignorado: true,
        motivo: 'Conta inacessível (RLS?).',
      };
    }
    if (atual.status === 'PAGA') {
      return { contaUuid: null, jaPaga: true, ignorado: false };
    }
    if (atual.status === 'CANCELADA') {
      return {
        contaUuid: null,
        jaPaga: false,
        ignorado: true,
        motivo: 'Conta CANCELADA — pagamento ignorado.',
      };
    }
    await this.repo.marcarContaPaga({
      contaId,
      valorPago: dto.valorPago.toFixed(4),
    });
    return { contaUuid: null, jaPaga: false, ignorado: false };
  }
}
