/**
 * DTO de atualização parcial de usuário (admin).
 * Não aceita troca de senha — para isso há `/auth/password/change`
 * (auto-serviço) ou um futuro `/users/:uuid/reset-password` (admin).
 */
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  nome?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
