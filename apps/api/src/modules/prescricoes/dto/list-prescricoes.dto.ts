/**
 * Query DTO de listagem de prescrições (`GET
 * /v1/atendimentos/:atendUuid/prescricoes`).
 */
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export const PRESCRICAO_STATUSES = [
  'AGUARDANDO_ANALISE',
  'ATIVA',
  'SUSPENSA',
  'CANCELADA',
  'ENCERRADA',
  'RECUSADA_FARMACIA',
] as const;
export type PrescricaoStatus = (typeof PRESCRICAO_STATUSES)[number];

export class ListPrescricoesQueryDto {
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
  @IsArray()
  @IsEnum(PRESCRICAO_STATUSES, { each: true })
  status?: PrescricaoStatus[];
}

export interface PrescricaoItemResponse {
  uuid: string;
  procedimentoUuid: string;
  procedimentoNome: string | null;
  quantidade: string;
  unidadeMedida: string | null;
  dose: string | null;
  via: string | null;
  frequencia: string | null;
  horarios: string[] | null;
  duracaoDias: number | null;
  urgente: boolean;
  seNecessario: boolean;
  observacao: string | null;
  alertaAlergia: Record<string, unknown> | null;
  alertaInteracao: Record<string, unknown> | null;
  alertaDoseMax: Record<string, unknown> | null;
  statusItem: 'ATIVO' | 'SUSPENSO' | 'ENCERRADO' | 'RECUSADO';
}

export interface PrescricaoResponse {
  uuid: string;
  atendimentoUuid: string;
  pacienteUuid: string;
  prescritorUuid: string;
  dataHora: string;
  tipo:
    | 'MEDICAMENTO'
    | 'CUIDADO'
    | 'DIETA'
    | 'PROCEDIMENTO'
    | 'EXAME'
    | 'COMPOSTA';
  validadeInicio: string;
  validadeFim: string | null;
  status: PrescricaoStatus;
  observacaoGeral: string | null;
  assinadaEm: string | null;
  suspensaEm: string | null;
  suspensaMotivo: string | null;
  itens: PrescricaoItemResponse[];
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}
