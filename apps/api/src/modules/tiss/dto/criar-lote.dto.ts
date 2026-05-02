/**
 * `POST /v1/tiss/lotes` — cria lote agrupando guias prontas.
 *
 * O lote é POR convênio + competência (AAAA-MM). As guias informadas
 * precisam ser do mesmo convênio (validado no use case via JOIN com
 * a conta) e estar com `status='GERADA'` (não vinculadas a outro lote).
 *
 * `numeroLote` é opcional — quando ausente, o use case calcula
 * automaticamente o próximo número via `MAX+1` (formato 4 dígitos).
 */
import { ArrayMinSize, IsArray, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class CriarLoteDto {
  @IsUUID('4')
  convenioUuid!: string;

  /** AAAA-MM. */
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'competencia deve estar no formato AAAA-MM',
  })
  competencia!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  guiaUuids!: string[];

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]+$/)
  @MaxLength(20)
  numeroLote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;
}
