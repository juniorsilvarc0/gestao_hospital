/**
 * Tipos do serviço de assinatura ICP-Brasil.
 *
 * - `CertInfo`: dados do certificado (titular, emissor, validade, CPF
 *   quando A1/A3 pessoal). Em STUB, populamos com prestador logado.
 * - `AssinaturaResult`: o que vai persistir em
 *   `evolucoes.assinatura_digital` (JSONB). Estrutura imutável após
 *   gravada — o trigger DDL não permite mudar `assinada_em` depois.
 *
 * Em Fase 13 (`lib-cades`) o STUB é substituído por:
 *   - parse PKCS#11 / leitura A1/A3
 *   - timestamp via TSA (RFC 3161)
 *   - verificação CRL/OCSP
 *   - PAdES/CAdES estruturado
 */

export interface CertInfo {
  titular: string;
  emissor: string;
  validade: string;        // ISO 8601
  cpf?: string;            // se A1/A3 pessoa física
  cnpj?: string;           // se A1/A3 pessoa jurídica
  numeroSerie?: string;
  /** TRUE quando o registro é uma assinatura simulada (cert ausente). */
  simulado?: boolean;
}

export interface AssinaturaResult {
  certInfo: CertInfo;
  hash: string;              // SHA-256 hex do canonical-JSON do payload
  timestamp: string;         // ISO 8601 UTC
  algoritmo: string;         // 'SHA256-RSA' | 'SHA256-RSA-STUB'
  /** Assinatura em base64 (em STUB é o próprio hash codificado). */
  assinatura: string;
  /** TRUE se for STUB (Fase 13 substitui por implementação real). */
  stub: boolean;
}

export interface AssinarInput {
  payload: Record<string, unknown>;
  certPemBase64?: string;
  p12Base64?: string;
  p12Senha?: string;
  /** Override de cert info para STUB (titular = nome do prestador). */
  stubTitular?: string;
  stubCpf?: string;
}
