/**
 * `POST /v1/tiss/guias/gerar` — gera guias para uma conta.
 *
 * Aceita lista de tipos de guia desejados (default: todos os aplicáveis
 * dada a conta). O use case decide quais itens vão em cada guia
 * conforme `grupo_gasto`.
 */
import { ArrayMinSize, IsArray, IsEnum, IsOptional, IsUUID } from 'class-validator';

import { GUIA_TISS_TIPOS, type GuiaTissTipo } from '../domain/guia-tiss';

export class GerarGuiasDto {
  @IsUUID('4')
  contaUuid!: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(GUIA_TISS_TIPOS, { each: true })
  tipos?: GuiaTissTipo[];
}
