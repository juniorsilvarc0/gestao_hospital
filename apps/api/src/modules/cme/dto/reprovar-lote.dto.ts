/**
 * `POST /v1/cme/lotes/{uuid}/reprovar` — reprova um lote (RN-CME-03).
 *
 * O `indicadorBiologicoOk` é obrigatoriamente `false` no DTO para
 * documentação/contrato; o use case ignora valores divergentes mas
 * exigir o campo torna a intenção do operador explícita.
 */
import { Equals, IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';

export class ReprovarLoteDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  motivo!: string;

  @IsBoolean()
  @Equals(false, {
    message:
      'reprovação exige indicador biológico FALSE — para liberar use POST /liberar',
  })
  indicadorBiologicoOk!: boolean;
}
