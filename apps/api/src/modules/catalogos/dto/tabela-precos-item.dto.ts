/**
 * Body de `POST /tabelas-precos/:uuid/itens` — upsert de item.
 * Inclui ou atualiza pelo par (tabela_id, procedimento_id).
 */
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class UpsertTabelaPrecosItemDto {
  /**
   * Aceita o UUID externo do procedimento... mas como tabelas_procedimentos
   * não tem `uuid_externo`, expomos o `id` como string aqui.
   * Alternativa preferida: enviar `procedimentoCodigoTuss`, que é
   * único por tenant.
   */
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]+$/, { message: 'procedimentoId deve ser numérico' })
  procedimentoId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  procedimentoCodigoTuss?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  valor!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  valorFilme?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  porteAnestesico?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  tempoMinutos?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  custoOperacional?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;
}

export class LinkConvenioToTabelaDto {
  @IsUUID('4', { message: 'convenioUuid deve ser UUIDv4' })
  convenioUuid!: string;

  @IsOptional()
  @IsUUID('4', { message: 'planoUuid deve ser UUIDv4' })
  planoUuid?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  prioridade?: number;
}

export class ResolvePrecoDto {
  /**
   * Identificadores do procedimento — pelo menos um obrigatório.
   * `procedimentoId` é o BIGINT (string) do catálogo;
   * `procedimentoCodigoTuss` é a forma natural.
   */
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]+$/)
  procedimentoId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  procedimentoCodigoTuss?: string;

  @IsOptional()
  @IsUUID('4')
  convenioUuid?: string;

  @IsOptional()
  @IsUUID('4')
  planoUuid?: string;

  @IsOptional()
  @IsString()
  @Length(10, 10, { message: 'dataRealizacao em ISO YYYY-MM-DD' })
  dataRealizacao?: string;
}
