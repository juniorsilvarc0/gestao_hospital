/**
 * `POST /v1/repasse/apurar` — enfileira a apuração mensal.
 *
 * Campos:
 *   - `competencia`        — AAAA-MM (RN-REP-04). Apura todas as contas
 *                            FATURADAS no mês.
 *   - `prestadorUuids`     — opcional. Restringe a apuração a um conjunto
 *                            de prestadores (útil para reapurar 1 caso após
 *                            recurso de glosa).
 *   - `forceReapuracao`    — quando `true`, apaga repasses_itens já
 *                            apurados naquele (prestador, competência) e
 *                            re-insere. **Só permitido em status APURADO**;
 *                            CONFERIDO/LIBERADO/PAGO continuam imutáveis.
 */
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class ApurarDto {
  /** AAAA-MM */
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/u, {
    message: 'competencia deve ter formato AAAA-MM (ex.: 2026-04).',
  })
  competencia!: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  prestadorUuids?: string[];

  @IsOptional()
  @IsBoolean()
  forceReapuracao?: boolean;
}
