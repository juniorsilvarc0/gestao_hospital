/**
 * `POST /v1/atendimentos/:uuid/alta`.
 *
 * - `tipoAlta` espelha `enum_atendimento_tipo_alta`.
 * - `cidPrincipal` obrigatório quando `tipoAlta = OBITO` (CFM).
 */
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export const TIPOS_ALTA = [
  'ALTA_MEDICA',
  'ALTA_PEDIDO',
  'TRANSFERENCIA',
  'EVASAO',
  'OBITO',
] as const;
export type TipoAlta = (typeof TIPOS_ALTA)[number];

export class AltaDto {
  @IsEnum(TIPOS_ALTA)
  tipoAlta!: TipoAlta;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;

  /**
   * CID principal exigido em óbito (CFM). Use case valida.
   */
  @ValidateIf((o: AltaDto) => o.tipoAlta === 'OBITO')
  @IsString()
  @MaxLength(10)
  cidPrincipal?: string;
}
