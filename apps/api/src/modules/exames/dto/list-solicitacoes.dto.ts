/**
 * Query DTOs de listagens do módulo exames.
 *
 * - `ListSolicitacoesQueryDto` — `GET /v1/solicitacoes-exame` (filtros).
 * - `ListResultadosQueryDto` — `GET /v1/resultados-exame`.
 *
 * Paginação offset (segue o padrão `atendimentos`, `prescricoes`).
 *
 * Status / urgência aceitam CSV (`status=COLETADO,LAUDO_FINAL`) ou
 * array repetido (`?status=A&status=B`).
 */
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export const SOLICITACAO_EXAME_URGENCIAS = [
  'ROTINA',
  'URGENTE',
  'EMERGENCIA',
] as const;
export type SolicitacaoExameUrgencia =
  (typeof SOLICITACAO_EXAME_URGENCIAS)[number];

export const SOLICITACAO_EXAME_STATUSES = [
  'SOLICITADO',
  'AUTORIZADO',
  'COLETADO',
  'EM_PROCESSAMENTO',
  'LAUDO_PARCIAL',
  'LAUDO_FINAL',
  'CANCELADO',
  'NEGADO',
] as const;
export type SolicitacaoExameStatus =
  (typeof SOLICITACAO_EXAME_STATUSES)[number];

function csvOrArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

export class ListSolicitacoesQueryDto {
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? 1 : Number(value)))
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? 20 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  @IsOptional()
  @IsUUID('4')
  atendimentoUuid?: string;

  @IsOptional()
  @IsUUID('4')
  pacienteUuid?: string;

  @IsOptional()
  @IsEnum(SOLICITACAO_EXAME_URGENCIAS)
  urgencia?: SolicitacaoExameUrgencia;

  @IsOptional()
  @Transform(({ value }) => csvOrArray(value))
  @IsArray()
  @IsEnum(SOLICITACAO_EXAME_STATUSES, { each: true })
  status?: SolicitacaoExameStatus[];

  @IsOptional()
  @IsString()
  rangeInicio?: string;

  @IsOptional()
  @IsString()
  rangeFim?: string;
}

export class ListResultadosQueryDto {
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? 1 : Number(value)))
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? 20 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  @IsOptional()
  @IsUUID('4')
  pacienteUuid?: string;

  @IsOptional()
  @Transform(({ value }) => csvOrArray(value))
  @IsArray()
  @IsEnum(SOLICITACAO_EXAME_STATUSES, { each: true })
  status?: SolicitacaoExameStatus[];

  /** UUID do prestador laudista. */
  @IsOptional()
  @IsUUID('4')
  laudistaUuid?: string;

  /** Apenas resultados já assinados. */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'boolean') return value;
    const s = String(value).toLowerCase();
    return s === 'true' || s === '1' || s === 'yes';
  })
  apenasAssinados?: boolean;
}
