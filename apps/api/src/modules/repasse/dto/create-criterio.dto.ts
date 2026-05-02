/**
 * `POST /v1/repasse/criterios` — cria critério de repasse (RN-REP-02/03).
 *
 * Estrutura do payload:
 *   - `descricao`           — rótulo livre exibido na UI;
 *   - `vigenciaInicio`      — YYYY-MM-DD obrigatório (RN-REP-03 — vigência
 *                              é parte do snapshot);
 *   - `vigenciaFim`         — opcional (`null` = vigente indefinidamente);
 *   - `unidadeFaturamentoUuid` / `unidadeAtendimentoUuid` — escopo opcional;
 *   - `tipoBaseCalculo`     — VALOR_TOTAL, VALOR_COM_DEDUCOES, ...;
 *   - `momentoRepasse`      — AO_FATURAR | AO_CONFIRMAR_RECEBIMENTO | ...;
 *   - `diaFechamento` / `prazoDias` — apenas para `COM_PRAZO_DEFINIDO`;
 *   - `prioridade`          — inteiro ≥ 1; ordena resolução de conflitos
 *                              (maior prioridade ganha quando dois
 *                              critérios casam o mesmo item);
 *   - `regras`              — JSONB validado por `validateCriterioRegras`.
 *
 * O DTO faz só validação estrutural (class-validator). Validação semântica
 * (estrutura interna do JSONB `regras`) acontece no use case via
 * `validateCriterioRegras` — separação intencional para que o erro do
 * operador chegue como `BadRequestException` com a lista detalhada.
 */
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import {
  REPASSE_MOMENTO,
  REPASSE_TIPO_BASE_CALCULO,
  type RepasseMomento,
  type RepasseTipoBaseCalculo,
} from '../domain/criterio';

export class CreateCriterioDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  descricao!: string;

  /** YYYY-MM-DD */
  @IsDateString()
  vigenciaInicio!: string;

  /** YYYY-MM-DD; null = vigente indefinidamente. */
  @IsOptional()
  @IsDateString()
  vigenciaFim?: string;

  @IsOptional()
  @IsUUID('4')
  unidadeFaturamentoUuid?: string;

  @IsOptional()
  @IsUUID('4')
  unidadeAtendimentoUuid?: string;

  @IsEnum(REPASSE_TIPO_BASE_CALCULO)
  tipoBaseCalculo!: RepasseTipoBaseCalculo;

  @IsEnum(REPASSE_MOMENTO)
  momentoRepasse!: RepasseMomento;

  /** Dia do fechamento (1..31) — usado em momentoRepasse=COM_PRAZO_DEFINIDO. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  diaFechamento?: number;

  /** Prazo em dias após fechamento. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  prazoDias?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  prioridade?: number;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  /**
   * Estrutura JSONB com matchers/deducoes/acrescimos. Validação detalhada
   * em `validateCriterioRegras`. Aqui só garantimos que é um objeto.
   */
  @IsObject()
  regras!: Record<string, unknown>;
}
