/**
 * DTO de suspensão (RN-PRE-05).
 *
 * Sem `itemUuid` → suspende a prescrição inteira (todos os itens viram
 * `SUSPENSO` + status do cabeçalho `SUSPENSA`). Com `itemUuid` →
 * suspende somente aquele item.
 *
 * `motivo` é obrigatório (≥ 5 chars) — RN-PRE-05 exige justificativa.
 */
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class SuspenderDto {
  @IsOptional()
  @IsUUID('4')
  itemUuid?: string;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  motivo!: string;
}
