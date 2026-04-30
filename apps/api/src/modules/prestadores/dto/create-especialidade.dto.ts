/**
 * DTOs do catálogo CBOS — `POST/PATCH /v1/especialidades` (admin only).
 *
 * O CBOS oficial tem códigos numéricos de 6 dígitos, mas alguns
 * sistemas TISS aceitam até 10 caracteres alfanuméricos. Aceitamos
 * ambos para compatibilidade.
 */
import { IsBoolean, IsOptional, IsString, MaxLength, Matches, MinLength } from 'class-validator';

export class CreateEspecialidadeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(10)
  @Matches(/^[A-Za-z0-9-]+$/, {
    message: 'codigoCbos aceita apenas alfanuméricos e hífen',
  })
  codigoCbos!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nome!: string;
}

export class UpdateEspecialidadeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nome?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
