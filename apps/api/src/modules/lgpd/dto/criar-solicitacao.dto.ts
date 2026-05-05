/**
 * DTO genérico para `POST /v1/lgpd/solicitacoes/{tipo}`.
 *
 * Usado pelas rotas de ACESSO, CORRECAO e PORTABILIDADE — todas têm
 * o mesmo body. EXCLUSAO mantém o DTO específico
 * (`solicitacao-exclusao.dto.ts`) por compatibilidade Fase 3.
 *
 * Campos:
 *   - `pacienteUuid` — alvo da solicitação. (Para portal-paciente o
 *     próprio token resolve; aqui mantemos explícito porque admin
 *     também pode abrir em nome do titular.)
 *   - `motivo` — texto livre (até 2000 chars).
 *   - `dadosAdicionais` — payload livre (ex.: campos a corrigir, ANS
 *     destinatária da portabilidade); persistido como JSON anotado
 *     dentro de `motivo` (ver `LgpdRepository.composeMotivo`).
 */
import { Type } from 'class-transformer';
import {
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CriarSolicitacaoDto {
  @IsUUID('4')
  pacienteUuid!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  motivo?: string;

  /**
   * Estrutura livre. É serializada e concatenada ao motivo. Sem schema
   * fixo nesta fase — Fase 13+ pode tipar por `tipo`.
   */
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => Object)
  dadosAdicionais?: Record<string, unknown>;
}
