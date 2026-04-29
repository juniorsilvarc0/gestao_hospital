import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ description: 'Senha atual do usuário.' })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  senhaAtual!: string;

  @ApiProperty({
    description:
      'Nova senha. Mínimo 12 caracteres, máximo 256, NIST 800-63B.',
    minLength: 12,
    maxLength: 256,
  })
  @IsString()
  @MinLength(12)
  @MaxLength(256)
  novaSenha!: string;
}
