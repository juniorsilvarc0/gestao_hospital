/**
 * DTO parcial usado em `PATCH /v1/cirurgias/{uuid}`.
 *
 * Apenas campos editáveis ANTES do início (status `AGENDADA` /
 * `CONFIRMADA`). Status, fichas, OPME e cancelamento têm endpoints
 * próprios. Atualizar `salaUuid` ou `dataHoraAgendada` revalida
 * sobreposição (RN-CC-01).
 */
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  CIRURGIA_CLASSIFICACOES,
  CIRURGIA_TIPOS_ANESTESIA,
  type CirurgiaClassificacao,
  type CirurgiaTipoAnestesia,
} from '../domain/cirurgia';

import {
  EquipeMembroInputDto,
  ProcedimentoSecundarioInputDto,
} from './create-cirurgia.dto';

export class UpdateCirurgiaDto {
  @IsOptional()
  @IsUUID('4')
  procedimentoPrincipalUuid?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProcedimentoSecundarioInputDto)
  procedimentosSecundarios?: ProcedimentoSecundarioInputDto[];

  @IsOptional()
  @IsUUID('4')
  salaUuid?: string;

  @IsOptional()
  @IsDateString()
  dataHoraAgendada?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  duracaoEstimadaMinutos?: number;

  @IsOptional()
  @IsUUID('4')
  cirurgiaoUuid?: string;

  @IsOptional()
  @IsEnum(CIRURGIA_TIPOS_ANESTESIA)
  tipoAnestesia?: CirurgiaTipoAnestesia;

  @IsOptional()
  @IsEnum(CIRURGIA_CLASSIFICACOES)
  classificacaoCirurgia?: CirurgiaClassificacao;

  @IsOptional()
  @IsUUID('4')
  kitCirurgicoUuid?: string;

  @IsOptional()
  @IsUUID('4')
  cadernoGabaritoUuid?: string;

  @IsOptional()
  @IsBoolean()
  exigeAutorizacaoConvenio?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EquipeMembroInputDto)
  equipe?: EquipeMembroInputDto[];
}
