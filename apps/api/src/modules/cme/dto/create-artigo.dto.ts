/**
 * `POST /v1/cme/lotes/{uuid}/artigos` — adiciona artigo a um lote.
 */
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateArtigoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  codigoArtigo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  descricao?: string;
}
