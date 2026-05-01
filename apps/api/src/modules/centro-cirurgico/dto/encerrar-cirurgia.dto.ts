/**
 * DTO de `POST /v1/cirurgias/{uuid}/encerrar` — RN-CC-04 e RN-CC-06.
 *
 * Trigger de banco bloqueia encerrar sem ficha cirúrgica + ficha
 * anestésica. O use case faz validação prévia para retornar 422
 * estruturado (ao invés de cair no `RAISE EXCEPTION`).
 */
import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class EncerrarCirurgiaDto {
  @IsDateString()
  dataHoraFim!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  intercorrencias?: string;
}
