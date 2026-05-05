/**
 * Query DTO — `GET /v1/auditoria/security-events`.
 *
 * Tabela `audit_security_events` é a trilha cross-tenant + tenant-local
 * de eventos de segurança (RN-SEG-06/07, RN-LGP-04).
 */
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export const SECURITY_EVENT_TIPOS = [
  'TENANT_VIOLATION',
  'PERFIL_ALTERADO',
  'BLOQUEIO_TEMPORARIO',
  'BLOQUEIO_DEFINITIVO',
  'CERTIFICADO_INVALIDO',
  'EXPORT_MASSA_TENTATIVA',
  'TOKEN_REUSO_DETECTADO',
  'OUTROS',
] as const;
export type SecurityEventTipo = (typeof SECURITY_EVENT_TIPOS)[number];

export const SECURITY_EVENT_SEVERIDADES = [
  'INFO',
  'WARNING',
  'ALERTA',
  'CRITICO',
] as const;
export type SecurityEventSeveridade =
  (typeof SECURITY_EVENT_SEVERIDADES)[number];

export class ListSecurityQueryDto {
  @IsOptional()
  @IsEnum(SECURITY_EVENT_TIPOS)
  tipo?: SecurityEventTipo;

  @IsOptional()
  @IsEnum(SECURITY_EVENT_SEVERIDADES)
  severidade?: SecurityEventSeveridade;

  @IsOptional()
  @IsDateString()
  dataInicio?: string;

  @IsOptional()
  @IsDateString()
  dataFim?: string;

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
