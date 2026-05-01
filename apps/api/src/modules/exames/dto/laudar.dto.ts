/**
 * `POST /v1/resultados-exame/:uuid/laudar` — payload (RN-LAB-04).
 *
 * Os campos de certificado são opcionais: na ausência deles, o
 * `IcpBrasilSigner` (port — Trilha A R2 entrega o real) cai no stub
 * com cert "AC HMS-BR DEV". Em produção (Fase 13), `certPemBase64`
 * (A1) ou `p12Base64`+`p12Senha` (A1/A3 com PKCS#12) são obrigatórios.
 */
import { IsBase64, IsOptional, IsString, MaxLength } from 'class-validator';

export class LaudarDto {
  /** PEM do certificado (A1) em base64, opcional em dev. */
  @IsOptional()
  @IsBase64()
  certPemBase64?: string;

  /** Container PKCS#12 em base64 (A1/A3). */
  @IsOptional()
  @IsBase64()
  p12Base64?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  p12Senha?: string;
}
