/**
 * `POST /v1/same/emprestimos/{uuid}/devolver` — devolução do prontuário
 * físico ao arquivo. Observação opcional (ex.: "devolvido com folha
 * solta na contracapa").
 */
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DevolverEmprestimoDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string;
}
