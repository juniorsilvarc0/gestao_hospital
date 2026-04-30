/**
 * DTO do PUT `/v1/agendas-recursos/:uuid/disponibilidade` — bulk replace.
 *
 * Aceita uma lista de janelas semanais (`diaSemana`) e/ou de datas
 * específicas (`dataEspecifica`). O use case substitui TODA a
 * disponibilidade vigente do recurso (operação atômica).
 */
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const HORA_REGEX = /^([0-1]\d|2[0-3]):[0-5]\d$/;

export class JanelaDisponibilidadeDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  diaSemana?: number;

  @IsOptional()
  @IsDateString({ strict: false })
  dataEspecifica?: string;

  @IsString()
  @Matches(HORA_REGEX, { message: 'horaInicio deve ser HH:MM (24h)' })
  horaInicio!: string;

  @IsString()
  @Matches(HORA_REGEX, { message: 'horaFim deve ser HH:MM (24h)' })
  horaFim!: string;

  @IsOptional()
  @IsDateString({ strict: false })
  vigenciaInicio?: string;

  @IsOptional()
  @IsDateString({ strict: false })
  vigenciaFim?: string;

  @IsOptional()
  @IsBoolean()
  ativa?: boolean;
}

export class SetDisponibilidadesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JanelaDisponibilidadeDto)
  janelas!: JanelaDisponibilidadeDto[];
}
