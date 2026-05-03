/**
 * `POST /v1/cme/lotes` — cria um lote de esterilização.
 */
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { CME_METODOS, type CmeMetodo } from '../domain/lote';

export class CreateLoteCmeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  numero!: string;

  @IsEnum(CME_METODOS)
  metodo!: CmeMetodo;

  /** ISO-8601 com timezone — instante da esterilização. */
  @IsISO8601()
  dataEsterilizacao!: string;

  /** YYYY-MM-DD — validade do lote. */
  @IsDateString()
  validade!: string;

  /** UUID do prestador responsável (enfermeiro/técnico CME). */
  @IsUUID('4')
  responsavelUuid!: string;

  @IsOptional()
  @IsBoolean()
  indicadorQuimicoOk?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string;
}
