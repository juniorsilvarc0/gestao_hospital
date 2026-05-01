/**
 * DTO de assinatura ICP-Brasil (RN-PEP-02).
 *
 * Para a Fase 6, a assinatura é STUB:
 *   - Se ambos `certPemBase64` e `p12Base64` ausentes → simulação com
 *     dados do prestador logado (cert fake `AC HMS-BR DEV`).
 *   - Em produção (Fase 13), payload completo via `lib-cades`.
 */
import { IsOptional, IsString } from 'class-validator';

export class AssinarDto {
  @IsOptional()
  @IsString()
  certPemBase64?: string;

  @IsOptional()
  @IsString()
  p12Base64?: string;

  @IsOptional()
  @IsString()
  p12Senha?: string;
}
