/**
 * DTO para `POST /v1/lgpd/exports/{uuid}/rejeitar`.
 *
 * Motivo é obrigatório (mín. 10 chars) — ele é registrado em
 * `motivo_rejeicao` e fica auditado para LGPD.
 */
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RejeitarExportDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  motivo!: string;
}
