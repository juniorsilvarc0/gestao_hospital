/**
 * DTO para `POST /v1/lgpd/solicitacoes/exclusao`.
 *
 * RN-LGP-03 — Solicitação de exclusão de dados pessoais é registrada,
 * NÃO é processada automaticamente. Prontuário clínico tem retenção de
 * 20 anos (CFM 1.638). Fluxo manual: Encarregado/DPO revisa e responde.
 */
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class SolicitacaoExclusaoDto {
  @IsUUID('4')
  pacienteUuid!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  motivo?: string;
}
