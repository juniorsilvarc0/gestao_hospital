/**
 * `POST /v1/portal/paciente/agendamento` — auto-agendamento.
 *
 * O paciente NÃO informa `pacienteUuid`: é resolvido do `RequestContext`
 * via `PacienteContextResolver`. Demais campos são equivalentes ao
 * `CreateAgendamentoDto`, com restrições adicionais:
 *
 *   - `tipo` restrito a `CONSULTA` / `EXAME` / `TELECONSULTA` (auto-
 *     agendamento de internação/cirurgia exige fluxo médico, não portal).
 *   - `convenioUuid` quando presente é validado contra `pacientes_convenios`
 *     no use case.
 *   - encaixe: portal NÃO pode forçar encaixe — `encaixe` proibido.
 */
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export const PORTAL_TIPOS_PERMITIDOS = [
  'CONSULTA',
  'EXAME',
  'TELECONSULTA',
] as const;
export type PortalTipo = (typeof PORTAL_TIPOS_PERMITIDOS)[number];

export class AutoAgendarDto {
  @IsUUID('4')
  recursoUuid!: string;

  @IsDateString()
  inicio!: string;

  @IsDateString()
  fim!: string;

  @IsEnum(PORTAL_TIPOS_PERMITIDOS)
  tipo!: PortalTipo;

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
  @IsString()
  @MaxLength(500)
  observacao?: string;
}
