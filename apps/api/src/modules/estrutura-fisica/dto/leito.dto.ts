/**
 * DTOs de `leitos` — inclui CRUD e a transição de status com
 * otimistic lock.
 *
 * Tipos enumerados (Prisma):
 *   - `enum_leito_tipo_acomodacao`: ENFERMARIA, APARTAMENTO, UTI, SEMI_UTI, ISOLAMENTO, OBSERVACAO
 *   - `enum_leito_status`: DISPONIVEL, OCUPADO, RESERVADO, HIGIENIZACAO, MANUTENCAO, BLOQUEADO
 */
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  enum_leito_tipo_acomodacao as LeitoTipoAcomodacao,
  enum_leito_status as LeitoStatus,
} from '@prisma/client';

export class CreateLeitoDto {
  @IsString()
  @MaxLength(20)
  codigo!: string;

  @IsNumberString({ no_symbols: true }, { message: 'setorId inválido.' })
  @MaxLength(20)
  setorId!: string;

  @IsEnum(LeitoTipoAcomodacao, { message: 'tipoAcomodacao inválido.' })
  tipoAcomodacao!: LeitoTipoAcomodacao;

  @IsOptional()
  @IsBoolean()
  extra?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;
}

export class UpdateLeitoDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  codigo?: string;

  @IsOptional()
  @IsEnum(LeitoTipoAcomodacao)
  tipoAcomodacao?: LeitoTipoAcomodacao;

  @IsOptional()
  @IsBoolean()
  extra?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string | null;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

export class ChangeLeitoStatusDto {
  @IsEnum(LeitoStatus, { message: 'novoStatus inválido.' })
  novoStatus!: LeitoStatus;

  /** Versão atual conhecida pelo cliente — base do otimistic lock. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  versao!: number;
}

export class ListLeitosQueryDto {
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

  @IsOptional()
  @IsNumberString({ no_symbols: true })
  @MaxLength(20)
  setor_id?: string;

  @IsOptional()
  @IsEnum(LeitoStatus)
  status?: LeitoStatus;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  ativo?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}

export interface LeitoResponse {
  id: string;
  uuid: string;
  codigo: string;
  setorId: string;
  setorUuid: string | null;
  tipoAcomodacao: LeitoTipoAcomodacao;
  status: LeitoStatus;
  extra: boolean;
  observacao: string | null;
  ativo: boolean;
  versao: number;
  ocupacaoIniciadaEm: string | null;
  ocupacaoPrevistaFim: string | null;
  pacienteId: string | null;
  atendimentoId: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface LeitoMapaSetor {
  setorId: string;
  setorNome: string;
  totais: Record<LeitoStatus, number>;
  leitos: LeitoResponse[];
}
