/**
 * Query DTO — `GET /v1/auditoria/eventos`.
 *
 * Filtros opcionais sobre `auditoria_eventos` (particionada por mês via
 * `created_at`). RLS já isola por tenant — aqui só compomos os
 * predicados do filtro.
 */
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const AUDIT_OPERACOES = ['I', 'U', 'D', 'S'] as const;
export type AuditOperacao = (typeof AUDIT_OPERACOES)[number];

export class ListEventosQueryDto {
  /** Ex.: `pacientes`, `prescricoes`, `lgpd_exports`. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  tabela?: string;

  /** Ex.: `lgpd.export`, `pep.evolucao.assinada`. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  finalidade?: string;

  /** UUID externo do usuário cujos eventos serão filtrados. */
  @IsOptional()
  @IsUUID('4')
  usuarioUuid?: string;

  /** Filtro `>=` em `created_at`. ISO-8601. */
  @IsOptional()
  @IsDateString()
  dataInicio?: string;

  /** Filtro `<=` em `created_at`. ISO-8601. */
  @IsOptional()
  @IsDateString()
  dataFim?: string;

  @IsOptional()
  @IsIn(AUDIT_OPERACOES)
  operacao?: AuditOperacao;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number = 50;
}
