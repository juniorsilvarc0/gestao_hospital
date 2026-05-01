/**
 * DTO de lançamento manual no livro de controlados (`POST
 * /v1/farmacia/livro-controlados/movimento`).
 *
 * Usado para entradas (recebimento de fornecedor), perdas (vencimento,
 * quebra) e ajustes (inventário). Saídas com vínculo a paciente/receita
 * vêm via fluxo de dispensação — esse endpoint cobre apenas saídas
 * "manuais" devidamente justificadas.
 */
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  IsUrl,
} from 'class-validator';

import {
  LIVRO_TIPOS_MOVIMENTO,
  type LivroTipoMovimento,
} from '../domain/livro-controlados';

export class CreateMovimentoControladoDto {
  @IsUUID('4')
  procedimentoUuid!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  lote!: string;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  quantidade!: number;

  @IsEnum(LIVRO_TIPOS_MOVIMENTO)
  tipoMovimento!: LivroTipoMovimento;

  /**
   * Para `AJUSTE`, o saldo final é informado livremente. Os demais
   * tipos calculam saldo a partir do saldo anterior + sinal.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  saldoAtualAjuste?: number;

  @IsOptional()
  @IsUUID('4')
  pacienteUuid?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  receitaDocumentoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;
}
