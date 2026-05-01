/**
 * `POST /v1/atendimentos/:atendUuid/solicitacoes-exame` — payload (RN-LAB-01).
 *
 * - `urgencia` espelha `enum_solicitacao_exame_urgencia`.
 * - `indicacaoClinica` é obrigatória e mínima 10 chars (clínica
 *   relevante; valida no use case também porque a coluna no banco é
 *   NOT NULL e queremos mensagem amigável antes de bater no DB).
 * - `itens` ≥ 1 — uma solicitação sem item não tem sentido clínico.
 * - `numeroGuia` opcional (operadora exige em alguns convênios).
 */
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import {
  SOLICITACAO_EXAME_URGENCIAS,
  type SolicitacaoExameUrgencia,
} from './list-solicitacoes.dto';

export class SolicitarExameItemDto {
  @IsUUID('4')
  procedimentoUuid!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;
}

export class SolicitarExameDto {
  @IsEnum(SOLICITACAO_EXAME_URGENCIAS)
  urgencia!: SolicitacaoExameUrgencia;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  indicacaoClinica!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  numeroGuia?: string;

  /**
   * Prestador solicitante (CRM). Quando ausente, o use case tenta
   * resolver pelo `usuarios.prestador_id` da request. Manter explícito
   * é preferível para ambientes onde o usuário tem >1 prestador
   * vinculado (interconsulta).
   */
  @IsOptional()
  @IsUUID('4')
  solicitanteUuid?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SolicitarExameItemDto)
  itens!: SolicitarExameItemDto[];
}
