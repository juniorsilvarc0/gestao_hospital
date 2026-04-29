/**
 * DTO de criação de usuário (admin).
 *
 * Senha vem aqui em **texto plano** (apenas durante a POST). Hash é
 * feito no use case com Argon2id (RNF-002). NUNCA logamos esse campo —
 * o redact do pino-http já cobre `req.body.password` e `req.body.senha`.
 */
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';

export class CreateUserDto {
  @IsEmail({}, { message: 'email inválido' })
  @MaxLength(200)
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(300)
  nome!: string;

  /**
   * Senha temporária. Mínimo 12 caracteres (RN-SEG-01). A política
   * NIST 800-63B (sem complexidade obrigatória) é aplicada no use case;
   * aqui só validamos comprimento mínimo.
   */
  @IsString()
  @MinLength(12, { message: 'senha precisa ter ao menos 12 caracteres' })
  @MaxLength(256)
  senha!: string;

  /** Códigos de perfis a vincular já na criação. Ex.: ['MEDICO']. */
  @IsArray()
  @ArrayNotEmpty({ message: 'pelo menos um perfil é obrigatório' })
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  @Matches(/^[A-Z][A-Z0-9_]*$/, {
    each: true,
    message: 'cada perfil deve estar em SCREAMING_SNAKE_CASE',
  })
  perfis!: string[];

  @IsOptional()
  @IsBoolean()
  precisaTrocarSenha?: boolean;
}
