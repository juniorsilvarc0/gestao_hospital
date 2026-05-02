/**
 * `POST /v1/contas/{uuid}/recalcular` — body com chave de idempotência.
 *
 * RN-FAT-07: recálculo é idempotente via `operacaoUuid`. Mesma operação
 * = mesmo resultado, sem duplicar.
 */
import { IsUUID } from 'class-validator';

export class RecalcularDto {
  @IsUUID('4')
  operacaoUuid!: string;
}
