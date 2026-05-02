/**
 * `POST /v1/tiss/lotes/{uuid}/reenviar` — abre um novo lote com
 * `lote_anterior_id` apontando para o original. As guias são as mesmas;
 * cabe ao operador editar o que for necessário antes do envio.
 *
 * Pode ser chamado SEM body (apenas reagrupa as guias originais).
 * Caso queira enviar com observação ou guias adicionais, o body é opcional.
 */
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ReenviarLoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;

  @IsOptional()
  @IsUUID('4', { each: true })
  guiaUuids?: string[];
}
