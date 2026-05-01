/**
 * DTO de reaprazamento (RN-PRE-04).
 *
 * Mudança de horários da enfermagem em **um item específico**. NÃO
 * altera `assinada_em` da prescrição — o reaprazamento é um evento
 * separado, com semântica diferente do médico.
 *
 * `novosHorarios`: array de strings `HH:MM` (24h, sem timezone — é a
 * tabela de horários ao longo do dia, ex.: `["06:00","14:00","22:00"]`).
 */
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class ReaprazarDto {
  @IsUUID('4')
  itemUuid!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(24)
  @IsString({ each: true })
  @Matches(HHMM, { each: true, message: 'Horário deve estar no formato HH:MM' })
  novosHorarios!: string[];
}
