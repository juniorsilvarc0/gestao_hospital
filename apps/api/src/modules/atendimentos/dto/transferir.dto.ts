/**
 * `POST /v1/atendimentos/:uuid/transferir` (RN-ATE-08).
 *
 * - Transferência interna: mantém o mesmo `atendimento_id`, troca de
 *   leito/setor. Libera leito antigo (HIGIENIZACAO), aloca novo
 *   (mesma máquina de estado da internação).
 * - Transferência externa: cria novo atendimento com
 *   `atendimento_origem_id` apontando o atual; atual fica `ALTA` com
 *   `tipo_alta = TRANSFERENCIA`.
 */
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class TransferirDto {
  /**
   * `externo = true` → transferência externa (cria novo atendimento).
   * `externo = false` (default) → transferência interna (libera + aloca).
   */
  @IsOptional()
  @IsBoolean()
  externo?: boolean;

  // Transferência interna: leito novo (UUID + versão otimista).
  @ValidateIf((o: TransferirDto) => o.externo !== true)
  @IsUUID('4')
  leitoUuid?: string;

  @ValidateIf((o: TransferirDto) => o.externo !== true)
  @IsInt()
  @Min(1)
  leitoVersao?: number;

  @IsString()
  @MaxLength(500)
  motivo!: string;

  // Transferência externa: identifica destino (livre — outro hospital).
  @IsOptional()
  @IsString()
  @MaxLength(500)
  destinoExterno?: string;
}
