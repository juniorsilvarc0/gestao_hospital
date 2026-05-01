/**
 * DTO de emissão de documento clínico.
 *
 * Schemas por `tipo` validados via Zod no use case
 * (`emitir-documento.use-case.ts`). Aqui só carregamos `conteudo` como
 * objeto opaco — o use case faz o narrow seguindo o mapeamento:
 *
 *   ATESTADO            → { diagnosticoCid, diasAfastamento, observacao? }
 *   RECEITA_SIMPLES     → { medicamentos: [{nome, dose, via, frequencia, duracao}] }
 *   RECEITA_CONTROLADO  → { ...simples + numeroSequencial, tarjaTipo }
 *   DECLARACAO          → { texto, finalidade }
 *   ENCAMINHAMENTO      → { especialidade, motivo, urgencia }
 *   RESUMO_ALTA         → { diagnosticosCID[], procedimentosRealizados, prescricoesEmAlta, recomendacoes }
 */
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export const DOCUMENTO_TIPOS = [
  'ATESTADO',
  'RECEITA_SIMPLES',
  'RECEITA_CONTROLADO',
  'DECLARACAO',
  'ENCAMINHAMENTO',
  'RESUMO_ALTA',
  'OUTRO',
] as const;
export type DocumentoTipo = (typeof DOCUMENTO_TIPOS)[number];

export class EmitirDocumentoDto {
  @IsEnum(DOCUMENTO_TIPOS)
  tipo!: DocumentoTipo;

  /**
   * Prestador emissor. Opcional — se ausente, derivamos via mapeamento
   * `usuarios → prestadores` (algum perfil MEDICO/ENFERMEIRO ligado).
   */
  @IsOptional()
  @IsUUID('4')
  emissorUuid?: string;

  /**
   * Validade em dias (atestados, receitas). Quando `tipo=ATESTADO`, é
   * geralmente igual a `conteudo.diasAfastamento`.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  validadeDias?: number;

  /** Conteúdo estruturado por `tipo` — validado por Zod no use case. */
  @IsObject()
  conteudo!: Record<string, unknown>;
}
