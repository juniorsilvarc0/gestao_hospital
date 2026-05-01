/**
 * DTOs de resposta — leituras paginadas e detalhes do módulo farmácia.
 */
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

import {
  DISPENSACAO_STATUSES,
  DISPENSACAO_TURNOS,
  type DispensacaoStatus,
  type DispensacaoTipo,
  type DispensacaoTurno,
} from '../domain/dispensacao';
import {
  LIVRO_TIPOS_MOVIMENTO,
  type LivroTipoMovimento,
} from '../domain/livro-controlados';

export interface DispensacaoItemResponse {
  uuid: string;
  procedimentoUuid: string;
  procedimentoNome: string | null;
  prescricaoItemUuid: string | null;
  quantidadePrescrita: string;
  quantidadeDispensada: string;
  unidadeMedida: string | null;
  fatorConversaoAplicado: string | null;
  justificativaDivergencia: string | null;
  lote: string | null;
  validade: string | null;
  contaItemUuid: string | null;
  status: DispensacaoStatus;
}

export interface DispensacaoResponse {
  uuid: string;
  atendimentoUuid: string;
  pacienteUuid: string;
  prescricaoUuid: string | null;
  cirurgiaUuid: string | null;
  setorDestinoUuid: string | null;
  farmaceuticoUuid: string;
  dataHora: string;
  turno: DispensacaoTurno | null;
  tipo: DispensacaoTipo;
  status: DispensacaoStatus;
  observacao: string | null;
  dispensacaoOrigemUuid: string | null;
  itens: DispensacaoItemResponse[];
}

export interface PainelTurnoBucket {
  turno: DispensacaoTurno;
  quantidade: number;
  pendentes: number;
  separadas: number;
  dispensacoes: DispensacaoResponse[];
}

export interface PainelFarmaciaResponse {
  geradoEm: string;
  total: number;
  buckets: PainelTurnoBucket[];
}

export class ListPainelQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 200;

  @IsOptional()
  @IsEnum(DISPENSACAO_STATUSES, { each: true })
  status?: DispensacaoStatus[];

  @IsOptional()
  @IsEnum(DISPENSACAO_TURNOS)
  turno?: DispensacaoTurno;
}

export interface LivroControladosLinha {
  uuid: string;
  dataHora: string;
  procedimentoUuid: string;
  procedimentoNome: string | null;
  lote: string;
  quantidade: string;
  saldoAnterior: string;
  saldoAtual: string;
  tipoMovimento: LivroTipoMovimento;
  pacienteUuid: string | null;
  prescricaoId: string | null;
  dispensacaoItemUuid: string | null;
  receitaDocumentoUrl: string | null;
  farmaceuticoUuid: string;
  observacao: string | null;
}

export interface LivroControladosListResponse {
  data: LivroControladosLinha[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export class ListLivroQueryDto {
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
  @IsUUID('4')
  procedimentoUuid?: string;

  @IsOptional()
  lote?: string;

  @IsOptional()
  @IsEnum(LIVRO_TIPOS_MOVIMENTO)
  tipoMovimento?: LivroTipoMovimento;
}
