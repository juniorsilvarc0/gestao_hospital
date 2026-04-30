/**
 * DTO de criação de `agendas_bloqueios` (RN-AGE-02).
 *
 * Bloqueios futuros impedem criação de novos agendamentos no intervalo;
 * agendamentos pré-existentes ficam no calendário com alerta visual
 * (responsabilidade do front).
 */
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateBloqueioDto {
  @IsDateString()
  inicio!: string;

  @IsDateString()
  fim!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  motivo?: string;
}
