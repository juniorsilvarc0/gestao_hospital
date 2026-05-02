/**
 * `POST /v1/repasse/reapurar` — força reapuração manual de uma conta.
 *
 * Body informa a conta-alvo + motivo (auditável). Reapuração automática
 * é tratada pelo listener `glosa-resolvida.listener.ts`.
 */
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class ReapurarDto {
  @IsUUID('4')
  contaUuid!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(500)
  motivo!: string;
}
