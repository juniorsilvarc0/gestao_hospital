import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Código curto do tenant (ex.: "dev").',
    example: 'dev',
    minLength: 1,
    maxLength: 20,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  tenantCode!: string;

  @ApiProperty({ description: 'Email do usuário.', example: 'admin@hms.local' })
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @ApiProperty({
    description: 'Senha (texto puro — só por TLS).',
    minLength: 1,
    maxLength: 256,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  senha!: string;

  @ApiProperty({
    description:
      'Código TOTPg de 6 dígitos quando o usuário tem MFA habilitado (Trilha B).',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  mfaCode?: string;
}
