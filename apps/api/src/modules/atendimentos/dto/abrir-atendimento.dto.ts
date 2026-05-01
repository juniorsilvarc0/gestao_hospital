/**
 * `POST /v1/atendimentos` — payload de abertura.
 *
 * - `tipo` espelha `enum_atendimento_tipo`.
 * - `tipoCobranca` espelha `enum_tipo_cobranca`. Quando `CONVENIO`,
 *   `convenioUuid` + `numeroCarteirinha` são exigidos pelo CHECK
 *   `ck_atendimentos_conv` no banco; replicamos a regra na app para
 *   devolver 422 amigável ao usuário (RN-ATE-02).
 * - `senhaAutorizacao` exigido se procedimento exigir autorização
 *   (RN-ATE-03), validação no use case (precisa fetchar
 *   `tabelas_procedimentos.precisa_autorizacao`).
 */
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export const ATENDIMENTO_TIPOS = [
  'CONSULTA',
  'EXAME',
  'INTERNACAO',
  'CIRURGIA',
  'PRONTO_ATENDIMENTO',
  'TELECONSULTA',
  'OBSERVACAO',
] as const;
export type AtendimentoTipo = (typeof ATENDIMENTO_TIPOS)[number];

export const TIPOS_COBRANCA = ['PARTICULAR', 'CONVENIO', 'SUS'] as const;
export type TipoCobranca = (typeof TIPOS_COBRANCA)[number];

export class AbrirAtendimentoDto {
  @IsUUID('4')
  pacienteUuid!: string;

  @IsUUID('4')
  prestadorUuid!: string;

  @IsUUID('4')
  setorUuid!: string;

  @IsUUID('4')
  unidadeFaturamentoUuid!: string;

  @IsUUID('4')
  unidadeAtendimentoUuid!: string;

  @IsEnum(ATENDIMENTO_TIPOS)
  tipo!: AtendimentoTipo;

  @IsEnum(TIPOS_COBRANCA)
  tipoCobranca!: TipoCobranca;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivoAtendimento?: string;

  @IsOptional()
  @IsUUID('4')
  agendamentoUuid?: string;

  // Convênio (obrigatório se tipoCobranca = CONVENIO).
  @ValidateIf((o: AbrirAtendimentoDto) => o.tipoCobranca === 'CONVENIO')
  @IsUUID('4')
  convenioUuid?: string;

  @ValidateIf((o: AbrirAtendimentoDto) => o.tipoCobranca === 'CONVENIO')
  @IsString()
  @MaxLength(40)
  numeroCarteirinha?: string;

  @IsOptional()
  @IsUUID('4')
  planoUuid?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  numeroGuiaOperadora?: string;

  // Procedimento principal (para autorização — RN-ATE-03).
  @IsOptional()
  @IsUUID('4')
  procedimentoUuid?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  senhaAutorizacao?: string;

  /**
   * Flag de urgência (RN-ATE-03): permite prosseguir sem senha mesmo
   * que `precisa_autorizacao = TRUE`. Exige `urgenciaJustificativa`.
   */
  @IsOptional()
  @IsBoolean()
  urgencia?: boolean;

  @ValidateIf((o: AbrirAtendimentoDto) => o.urgencia === true)
  @IsString()
  @MaxLength(300)
  urgenciaJustificativa?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cidsSecundarios?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(10)
  cidPrincipal?: string;

  @IsOptional()
  @IsString()
  observacao?: string;
}
