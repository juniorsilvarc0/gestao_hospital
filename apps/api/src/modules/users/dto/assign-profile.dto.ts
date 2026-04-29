/**
 * DTO de atribuição/remoção de perfil (admin).
 *
 * Suporta tanto:
 *   - vincular novo perfil (`acao = 'attach'`)
 *   - revogar perfil existente (`acao = 'detach'`)
 *
 * Toda operação gera evento de auditoria `auth.profile.changed` (RN-SEG-07).
 */
import { IsIn, IsString, Matches, MaxLength } from 'class-validator';

export class AssignProfileDto {
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Z][A-Z0-9_]*$/, {
    message: 'codigo do perfil deve estar em SCREAMING_SNAKE_CASE',
  })
  perfilCodigo!: string;

  @IsString()
  @IsIn(['attach', 'detach'], {
    message: "acao deve ser 'attach' ou 'detach'",
  })
  acao!: 'attach' | 'detach';
}
