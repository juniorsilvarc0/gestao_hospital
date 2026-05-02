/**
 * `GET /v1/repasse/folha` — folha de produção consolidada.
 */
import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class FolhaQueryDto {
  /** Competência AAAA-MM. */
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'competencia deve ser AAAA-MM (ex.: 2026-04).',
  })
  competencia!: string;

  @IsOptional()
  @IsUUID('4')
  prestadorUuid?: string;

  @IsOptional()
  @IsUUID('4')
  unidadeFaturamentoUuid?: string;
}

export class FolhaPrestadorQueryDto {
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'competencia deve ser AAAA-MM (ex.: 2026-04).',
  })
  competencia!: string;
}
