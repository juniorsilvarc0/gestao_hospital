/**
 * DTO de análise farmacêutica (RN-PRE-01).
 *
 * - `outcome` espelha `enum_analise_farmaceutica_status` excluindo
 *   `PENDENTE` (que é estado interno da fila, não vem da request).
 * - `RECUSADA` exige `parecer` ≥ 5 chars (RN-PRE-01 — parecer
 *   obrigatório). `APROVADA_RESSALVAS` exige ao menos 1 ressalva.
 * - `farmaceuticoUuid` opcional: quando ausente, o use case usa o
 *   prestador associado ao usuário logado (resolvido via `usuarios →
 *   prestadores`). Para casos de delegação registrada, frontend pode
 *   forçar.
 */
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export const ANALISE_OUTCOMES = [
  'APROVADA',
  'APROVADA_RESSALVAS',
  'RECUSADA',
] as const;
export type AnaliseOutcome = (typeof ANALISE_OUTCOMES)[number];

export class AnaliseRessalvaDto {
  @IsUUID('4')
  itemUuid!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  observacao!: string;
}

export class AnalisarPrescricaoDto {
  @IsEnum(ANALISE_OUTCOMES)
  outcome!: AnaliseOutcome;

  @ValidateIf((o: AnalisarPrescricaoDto) => o.outcome === 'RECUSADA')
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  parecer?: string;

  @ValidateIf(
    (o: AnalisarPrescricaoDto) =>
      o.outcome === 'APROVADA_RESSALVAS' || o.outcome === 'APROVADA',
  )
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  parecerLivre?: string;

  @ValidateIf((o: AnalisarPrescricaoDto) => o.outcome === 'APROVADA_RESSALVAS')
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnaliseRessalvaDto)
  ressalvas?: AnaliseRessalvaDto[];

  @IsOptional()
  @IsUUID('4')
  farmaceuticoUuid?: string;
}
