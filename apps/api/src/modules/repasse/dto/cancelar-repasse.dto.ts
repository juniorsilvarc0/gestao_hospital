/**
 * `POST /v1/repasse/{uuid}/cancelar` — qualquer não-CANCELADO → CANCELADO.
 *
 * Cancelamento partindo de PAGO é estorno auditável (a trigger
 * `tg_repasse_imutavel` permite essa única transição saindo de PAGO).
 */
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CancelarRepasseDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  motivo!: string;
}
