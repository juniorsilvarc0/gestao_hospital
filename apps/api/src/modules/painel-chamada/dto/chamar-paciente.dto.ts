/**
 * Body do `POST /v1/painel-chamada/chamar`.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ChamarPacienteDto {
  @ApiProperty({
    description: 'UUID externo do agendamento a ser chamado.',
    format: 'uuid',
  })
  @IsUUID('4')
  agendamentoUuid!: string;

  @ApiPropertyOptional({
    description:
      'UUID do setor para projetar a chamada. Se omitido, é derivado ' +
      'do recurso (sala do agendamento). RN-AGE-05/painel-chamada.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('4')
  setorUuid?: string;

  @ApiPropertyOptional({
    description:
      'Identificação curta da sala/consultório para mostrar na TV ' +
      '(ex.: "Sala 3", "Consultório B"). Default: derivado do recurso.',
    maxLength: 40,
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  sala?: string;
}
