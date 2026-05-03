/**
 * `POST /v1/visitas` — registra entrada de visitante (RN-VIS-01..04).
 *
 * Leito e setor não vêm no payload — derivamos do atendimento ativo do
 * paciente.
 */
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class RegistrarVisitaDto {
  @IsUUID('4')
  visitanteUuid!: string;

  @IsUUID('4')
  pacienteUuid!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;
}
