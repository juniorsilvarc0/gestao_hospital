/**
 * DTO para `POST /v1/lgpd/exports`.
 *
 * Cria um pedido de export FHIR/JSON (RN-LGP-04). Vai para o status
 * inicial `AGUARDANDO_APROVACAO_DPO` — o ciclo se completa via
 * aprovação dupla (DPO + Supervisor) antes de a geração ser disparada.
 *
 * `pacienteUuid` é opcional para permitir, no futuro, exports em massa
 * (paciente_id NULL). Nesta entrega, o caller é obrigado a passar — a
 * camada de aplicação valida.
 */
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

import { LGPD_EXPORT_FORMATOS, type LgpdExportFormato } from '../domain/export';

export class CriarExportDto {
  @IsOptional()
  @IsUUID('4')
  pacienteUuid?: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  motivoSolicitacao!: string;

  @IsOptional()
  @IsIn(LGPD_EXPORT_FORMATOS)
  formato?: LgpdExportFormato;
}
