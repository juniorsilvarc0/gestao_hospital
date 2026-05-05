/**
 * `GET /v1/indicadores/assistenciais/taxa-ocupacao` — query params.
 *
 * Filtros opcionais:
 *   - dia       (YYYY-MM-DD; default = hoje, aplicado no use case)
 *   - setorUuid (UUID v4)
 */
import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class TaxaOcupacaoQueryDto {
  @IsOptional()
  @IsString()
  @Matches(DATA_REGEX, {
    message: 'dia deve ser YYYY-MM-DD.',
  })
  dia?: string;

  @IsOptional()
  @IsUUID('4')
  setorUuid?: string;
}
