import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token de reset (UUID v4).' })
  @IsString()
  @IsUUID('4')
  token!: string;

  @ApiProperty({
    description: 'Nova senha. Mínimo 12, máximo 256.',
    minLength: 12,
    maxLength: 256,
  })
  @IsString()
  @MinLength(12)
  @MaxLength(256)
  novaSenha!: string;
}
