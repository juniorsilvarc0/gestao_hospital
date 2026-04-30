/**
 * DTO de criação de `agendamentos` (RN-AGE-01, RN-AGE-06).
 *
 * - `inicio` / `fim`: ISO 8601 com timezone (`2026-05-02T13:00:00-03:00`).
 *   O EXCLUDE constraint do banco trabalha em `tstzrange(inicio, fim, '[)')`,
 *   logo o intervalo é fechado-aberto (overlap inclusive na borda final).
 * - `encaixe = true` exige `encaixeMotivo` (CHECK `ck_agend_encaixe_motivo`).
 *   O use case valida o limite N por dia (RN-AGE-06).
 * - `tipo` espelha `enum_atendimento_tipo` para evitar acoplamento à enum
 *   gerada pelo Prisma (mesma lista, dupla declaração intencional).
 */
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export const AGENDAMENTO_TIPOS = [
  'CONSULTA',
  'EXAME',
  'INTERNACAO',
  'CIRURGIA',
  'PRONTO_ATENDIMENTO',
  'TELECONSULTA',
  'OBSERVACAO',
] as const;
export type AgendamentoTipo = (typeof AGENDAMENTO_TIPOS)[number];

export const AGENDAMENTO_ORIGENS = [
  'INTERNO',
  'PORTAL',
  'TOTEM',
  'TELEFONE',
  'API',
] as const;
export type AgendamentoOrigem = (typeof AGENDAMENTO_ORIGENS)[number];

export class CreateAgendamentoDto {
  @IsUUID('4')
  recursoUuid!: string;

  @IsUUID('4')
  pacienteUuid!: string;

  @IsDateString()
  inicio!: string;

  @IsDateString()
  fim!: string;

  @IsEnum(AGENDAMENTO_TIPOS)
  tipo!: AgendamentoTipo;

  @IsOptional()
  @IsUUID('4')
  procedimentoUuid?: string;

  @IsOptional()
  @IsUUID('4')
  convenioUuid?: string;

  @IsOptional()
  @IsUUID('4')
  planoUuid?: string;

  @IsOptional()
  @IsBoolean()
  encaixe?: boolean;

  /**
   * Motivo obrigatório quando `encaixe = true` (RN-AGE-06).
   * Restrição reforçada via CHECK `ck_agend_encaixe_motivo`.
   */
  @ValidateIf((o: CreateAgendamentoDto) => o.encaixe === true)
  @IsString()
  @MaxLength(300)
  encaixeMotivo?: string;

  @IsOptional()
  @IsIn(AGENDAMENTO_ORIGENS)
  origem?: AgendamentoOrigem;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;
}
