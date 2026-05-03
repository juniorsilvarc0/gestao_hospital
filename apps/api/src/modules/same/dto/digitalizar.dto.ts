/**
 * `POST /v1/same/prontuarios/{uuid}/digitalizar` — RN-SAM-03.
 *
 * Marca prontuário como digitalizado, com URL externa do PDF (geração
 * do PDF acontece fora deste serviço). O status pode mudar para
 * DIGITALIZADO; se está EMPRESTADO, mantém-se EMPRESTADO mas registra
 * a digitalização — quando devolvido, voltará para DIGITALIZADO.
 */
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class DigitalizarDto {
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  pdfLegadoUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string;
}
