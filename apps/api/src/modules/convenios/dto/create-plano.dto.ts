/**
 * DTO de criação de plano (vinculado a um convênio).
 */
import { IsIn, IsOptional, IsString, MaxLength, MinLength, Matches } from 'class-validator';

const TIPOS_ACOMODACAO = [
  'ENFERMARIA',
  'APARTAMENTO',
  'UTI',
  'SEMI_UTI',
  'ISOLAMENTO',
  'OBSERVACAO',
] as const;

export class CreatePlanoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  @Matches(/^[A-Z0-9_-]+$/i, {
    message: 'codigo aceita apenas alfanuméricos, hífen e underscore',
  })
  codigo!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  registroAns?: string;

  @IsOptional()
  @IsString()
  @IsIn(TIPOS_ACOMODACAO as readonly string[])
  tipoAcomodacao?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  segmentacao?: string;
}
