import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ description: 'Código do tenant (ex.: "dev").' })
  @IsString()
  @MaxLength(20)
  tenantCode!: string;

  @ApiProperty({ description: 'Email do usuário.' })
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @ApiProperty({
    description:
      'Base do link de reset (ex.: https://app.exemplo.com/reset-password). Opcional — usa default em dev.',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  resetUrlBase?: string;
}
