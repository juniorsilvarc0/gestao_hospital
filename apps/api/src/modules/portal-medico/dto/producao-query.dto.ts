/**
 * Query DTO para `GET /v1/portal/medico/producao`.
 *
 * `competencia` segue o padrão `AAAA-MM` usado pelo módulo Repasse.
 * Default no use case = competência atual.
 */
import { IsOptional, IsString, Matches } from 'class-validator';

export class ProducaoQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'competencia deve ser AAAA-MM (ex.: 2026-04).',
  })
  competencia?: string;
}
