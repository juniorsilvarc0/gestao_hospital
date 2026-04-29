import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Refresh token opaco (UUID v4).',
    example: '00000000-0000-0000-0000-000000000000',
  })
  @IsString()
  @IsUUID('4')
  refreshToken!: string;
}
