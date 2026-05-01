/**
 * `POST /v1/resultados-exame` — payload (RN-LAB-03).
 *
 * Pelo menos uma das três fontes de conteúdo (estruturado / texto /
 * pdfUrl) deve estar presente — o use case rejeita em runtime caso
 * todas estejam vazias para devolver mensagem clínica clara, em vez
 * de cair em CHECK violation no banco.
 *
 * `laudoEstruturado.analitos` é o caso típico de bioquímica/hemograma
 * (pares analito × valor × unidade × intervalo de referência). Para
 * imagem, `laudoTexto` + `imagensUrls` cobrem o uso real.
 */
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class AnalitoDto {
  @IsString()
  @MaxLength(120)
  nome!: string;

  @IsString()
  @MaxLength(120)
  valor!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unidade?: string;

  @IsOptional()
  @IsNumber()
  refMin?: number;

  @IsOptional()
  @IsNumber()
  refMax?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;
}

export class LaudoEstruturadoDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => AnalitoDto)
  analitos!: AnalitoDto[];
}

export class RegistrarResultadoDto {
  @IsUUID('4')
  solicitacaoItemUuid!: string;

  @IsOptional()
  @IsISO8601()
  dataColeta?: string;

  @IsOptional()
  @IsISO8601()
  dataProcessamento?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LaudoEstruturadoDto)
  laudoEstruturado?: LaudoEstruturadoDto;

  @IsOptional()
  @IsString()
  @MaxLength(50_000)
  laudoTexto?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  laudoPdfUrl?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUrl({ require_tld: false }, { each: true })
  imagensUrls?: string[];
}
