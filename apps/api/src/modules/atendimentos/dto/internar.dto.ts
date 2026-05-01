/**
 * `POST /v1/atendimentos/:uuid/internar` — RN-ATE-08, INVARIANTE #2.
 *
 * `leitoVersao` é a versão otimista do leito (UI lê do GET /v1/leitos/mapa).
 * Em conflito de versão (alguém alocou primeiro) → 409 com versão atual.
 */
import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class InternarDto {
  @IsUUID('4')
  leitoUuid!: string;

  @IsInt()
  @Min(1)
  leitoVersao!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;
}
