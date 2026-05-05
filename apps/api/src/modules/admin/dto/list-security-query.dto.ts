/**
 * `GET /v1/admin/security/events` — filtros + paginação.
 */
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
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

export class ListSecurityEventsQueryDto {
  @IsOptional()
  @IsUUID('4')
  tenantUuid?: string;

  @IsOptional()
  @IsEnum(SECURITY_EVENT_TIPOS)
  tipo?: SecurityEventTipo;

  @IsOptional()
  @IsEnum(SECURITY_EVENT_SEVERIDADES)
  severidade?: SecurityEventSeveridade;

  @IsOptional()
  @IsISO8601()
  dataInicio?: string;

  @IsOptional()
  @IsISO8601()
  dataFim?: string;

  @IsOptional()
  @IsString()
  ip?: string;

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

export class GetSecurityDashboardQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  dias?: number = 30;
}
