/**
 * `POST /v1/visitantes` — cadastra visitante.
 *
 * O CPF é recebido em claro mas o use case faz hash imediatamente —
 * NÃO logamos nem armazenamos o CPF original.
 */
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateVisitanteDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  nome!: string;

  /**
   * CPF em claro (string, com ou sem máscara). Hash + últimos 4 dígitos
   * gerados no use case. Nunca persistimos o valor recebido.
   */
  @IsString()
  @MinLength(11)
  @MaxLength(14)
  cpf!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  documentoFotoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string;
}
