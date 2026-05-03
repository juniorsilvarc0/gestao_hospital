/**
 * `POST /v1/portal/paciente/consentimentos/{uuid}/revogar` — revogação
 * com motivo. RN-LGP-01: revogação não deleta — apenas marca
 * `data_revogacao` e `motivo_revogacao`.
 */
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RevogarConsentimentoDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  motivo!: string;
}
