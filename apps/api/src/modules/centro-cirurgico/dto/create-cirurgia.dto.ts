/**
 * DTO de agendamento de cirurgia (`POST /v1/cirurgias`) — RN-CC-01.
 *
 * Cirurgia é criada em status `AGENDADA`. EXCLUDE constraint não impede
 * sobreposição em `AGENDADA` (apenas em CONFIRMADA/EM_ANDAMENTO/CONCLUIDA),
 * por isso o use case faz uma checagem prévia que retorna 409 estruturado
 * quando há conflito previsto na sala.
 */
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import {
  CIRURGIA_CLASSIFICACOES,
  CIRURGIA_TIPOS_ANESTESIA,
  type CirurgiaClassificacao,
  type CirurgiaTipoAnestesia,
} from '../domain/cirurgia';

export class ProcedimentoSecundarioInputDto {
  @IsUUID('4')
  procedimentoUuid!: string;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  quantidade!: number;
}

export class EquipeMembroInputDto {
  @IsUUID('4')
  prestadorUuid!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(40)
  funcao!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  ordem?: number;
}

export class CreateCirurgiaDto {
  @IsUUID('4')
  atendimentoUuid!: string;

  @IsUUID('4')
  procedimentoPrincipalUuid!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProcedimentoSecundarioInputDto)
  procedimentosSecundarios?: ProcedimentoSecundarioInputDto[];

  @IsUUID('4')
  salaUuid!: string;

  @IsDateString()
  dataHoraAgendada!: string;

  @IsInt()
  @Min(1)
  duracaoEstimadaMinutos!: number;

  @IsUUID('4')
  cirurgiaoUuid!: string;

  @IsOptional()
  @IsEnum(CIRURGIA_TIPOS_ANESTESIA)
  tipoAnestesia?: CirurgiaTipoAnestesia;

  @IsEnum(CIRURGIA_CLASSIFICACOES)
  classificacaoCirurgia!: CirurgiaClassificacao;

  @IsOptional()
  @IsUUID('4')
  kitCirurgicoUuid?: string;

  @IsOptional()
  @IsUUID('4')
  cadernoGabaritoUuid?: string;

  /**
   * Flag operacional — RN-CC-02: cirurgia eletiva pode requerer
   * autorização prévia do convênio. Apenas armazenado; sem integração.
   */
  @IsOptional()
  @IsBoolean()
  exigeAutorizacaoConvenio?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EquipeMembroInputDto)
  equipe!: EquipeMembroInputDto[];
}
