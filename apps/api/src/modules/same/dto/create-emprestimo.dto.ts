/**
 * `POST /v1/same/emprestimos` — RN-SAM-01.
 *
 * Empréstimo exige solicitante (capturado do contexto da request),
 * motivo e data de devolução prevista (default = hoje + 30 dias).
 */
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateEmprestimoDto {
  @IsUUID('4')
  prontuarioUuid!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(200)
  motivo!: string;

  /** YYYY-MM-DD; default = hoje + 30 dias. */
  @IsOptional()
  @IsDateString()
  dataDevolucaoPrevista?: string;
}
