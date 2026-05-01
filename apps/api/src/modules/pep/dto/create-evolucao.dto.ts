/**
 * DTO de criação de rascunho de evolução (RN-PEP-01/02).
 *
 * - `conteudo` é o documento estruturado do TipTap (ProseMirror JSON).
 *   Validamos apenas o shape mínimo (`type: 'doc'`); a sanitização
 *   completa fica em `tiptap-sanitizer.ts`.
 * - `cids` opcional (array de objetos {codigo, descricao?}).
 * - `sinaisVitais` opcional — se enviado, é um snapshot inline JSONB no
 *   próprio registro de evolução (RN-PEP-04). Não substitui o registro
 *   em `sinais_vitais` (que tem histórico/gráfico).
 */
import {
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const EVOLUCAO_TIPOS = [
  'ANAMNESE',
  'EXAME_CLINICO',
  'EVOLUCAO',
  'NOTA_ADMISSAO',
  'NOTA_ALTA',
  'PARECER',
  'INTERCONSULTA',
  'RESUMO_ALTA',
  'RETIFICACAO',
] as const;
export type EvolucaoTipo = (typeof EVOLUCAO_TIPOS)[number];

export const TIPO_PROFISSIONAL = [
  'MEDICO',
  'ENFERMEIRO',
  'TECNICO_ENFERMAGEM',
  'NUTRICIONISTA',
  'FISIOTERAPEUTA',
  'PSICOLOGO',
  'FARMACEUTICO',
  'FONOAUDIOLOGO',
  'TERAPEUTA_OCUPACIONAL',
  'ASSISTENTE_SOCIAL',
  'OUTROS',
] as const;
export type TipoProfissional = (typeof TIPO_PROFISSIONAL)[number];

export class CidItemDto {
  @IsString()
  codigo!: string;

  @IsOptional()
  @IsString()
  descricao?: string;
}

export class SinaisVitaisInlineDto {
  @IsOptional()
  paSistolica?: number;
  @IsOptional()
  paDiastolica?: number;
  @IsOptional()
  fc?: number;
  @IsOptional()
  fr?: number;
  @IsOptional()
  temperatura?: number;
  @IsOptional()
  satO2?: number;
  @IsOptional()
  glicemia?: number;
  @IsOptional()
  pesoKg?: number;
  @IsOptional()
  alturaCm?: number;
  @IsOptional()
  dorEva?: number;
}

export class CreateEvolucaoDto {
  @IsEnum(EVOLUCAO_TIPOS)
  tipo!: EvolucaoTipo;

  @IsEnum(TIPO_PROFISSIONAL)
  tipoProfissional!: TipoProfissional;

  /**
   * TipTap document JSON. Sanitizado via `tiptap-sanitizer.ts` antes da
   * persistência. Tipo `object` aqui — a estrutura é validada no use case.
   */
  @IsObject()
  conteudo!: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CidItemDto)
  cids?: CidItemDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SinaisVitaisInlineDto)
  sinaisVitais?: SinaisVitaisInlineDto;
}

/**
 * PATCH só funciona em rascunho (`assinada_em IS NULL`). Trigger DDL
 * bloqueia tentativa em registro assinado (INVARIANTE #3).
 */
export class UpdateEvolucaoDto {
  @IsOptional()
  @IsObject()
  conteudo?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CidItemDto)
  cids?: CidItemDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SinaisVitaisInlineDto)
  sinaisVitais?: SinaisVitaisInlineDto;
}
