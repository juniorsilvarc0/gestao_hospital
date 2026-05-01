/**
 * DTO de retificação (RN-PEP-03).
 *
 * Cria nova evolução tipo `RETIFICACAO` com `versao_anterior_id` apontando
 * para a evolução assinada original. A original NÃO é alterada (a trigger
 * DB já bloqueia mesmo se o use case tentasse).
 */
import { IsObject, IsString, MaxLength } from 'class-validator';

export class RetificarDto {
  /** Conteudo TipTap completo da nova versão. */
  @IsObject()
  conteudo!: Record<string, unknown>;

  /** Justificativa (auditoria — fica no diff de auditoria_eventos). */
  @IsString()
  @MaxLength(500)
  motivo!: string;
}
