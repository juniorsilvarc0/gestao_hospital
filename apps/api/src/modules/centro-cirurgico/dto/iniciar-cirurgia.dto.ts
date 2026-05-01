/**
 * DTO de `POST /v1/cirurgias/{uuid}/iniciar` — RN-CC-05.
 *
 * `pacienteEmSala = true` é o gatilho operacional que confirma que o
 * paciente está fisicamente posicionado em sala antes de marcar status
 * `EM_ANDAMENTO` e iniciar a contagem de tempo cirúrgico.
 */
import { IsBoolean, IsDateString, IsOptional } from 'class-validator';

export class IniciarCirurgiaDto {
  @IsBoolean()
  pacienteEmSala!: boolean;

  /** Override opcional do `data_hora_inicio`. Default: now(). */
  @IsOptional()
  @IsDateString()
  dataHoraInicio?: string;
}
