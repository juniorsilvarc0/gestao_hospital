/**
 * Filtros aceitos por `GET /v1/ccih/painel`.
 */
import { IsOptional, Matches } from 'class-validator';

export class PainelCcihQueryDto {
  /** Competência YYYY-MM. Default: mês corrente UTC. */
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'competencia deve ser YYYY-MM',
  })
  competencia?: string;
}
