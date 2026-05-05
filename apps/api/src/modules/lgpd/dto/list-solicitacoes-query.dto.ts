/**
 * Query DTO — `GET /v1/lgpd/solicitacoes` (admin) e
 * `GET /v1/lgpd/solicitacoes/me` (paciente).
 *
 * RLS já isola por tenant; aqui aplicamos filtros de tipo/status e
 * paginação. O endpoint `/me` ignora `pacienteUuid`.
 */
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

import {
  LGPD_SOLICITACAO_STATUSES,
  LGPD_SOLICITACAO_TIPOS,
  type LgpdSolicitacaoStatus,
  type LgpdSolicitacaoTipo,
} from '../domain/solicitacao';

export class ListSolicitacoesQueryDto {
  @IsOptional()
  @IsUUID('4')
  pacienteUuid?: string;

  @IsOptional()
  @IsIn(LGPD_SOLICITACAO_TIPOS)
  tipo?: LgpdSolicitacaoTipo;

  @IsOptional()
  @IsIn(LGPD_SOLICITACAO_STATUSES)
  status?: LgpdSolicitacaoStatus;

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
