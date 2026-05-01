/**
 * `IcpBrasilService` — assinatura digital de evoluções, prescrições,
 * laudos e documentos clínicos (RN-PEP-02).
 *
 * **STUB Fase 6.** Substituído na Fase 13 por `lib-cades` real
 * (PAdES/CAdES + TSA + CRL/OCSP).
 *
 * Comportamento:
 *   - Sem `certPemBase64`/`p12Base64` → simula com cert fake
 *     `{ titular, emissor: 'AC HMS-BR DEV', validade: now+1y, simulado: true }`.
 *   - Hash SHA-256 do canonical-JSON do payload (produz mesma string para
 *     mesmos campos, independente da ordem de chaves).
 *   - Timestamp ISO 8601 UTC.
 *   - Algoritmo: 'SHA256-RSA-STUB' (real seria 'SHA256-RSA').
 *
 * Garantias:
 *   - Determinismo: mesmo payload → mesmo hash. Permite verificação.
 *   - Imutabilidade: a `AssinaturaResult` é gravada uma única vez na
 *     coluna JSONB; trigger DDL bloqueia UPDATE/DELETE em registros
 *     com `assinada_em` (INVARIANTE #3).
 *   - Sem PHI em logs: o hash é seguro de logar; o payload bruto NÃO é.
 */
import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';

import type {
  AssinarInput,
  AssinaturaResult,
  CertInfo,
} from './icp-brasil.types';

@Injectable()
export class IcpBrasilService {
  private readonly logger = new Logger(IcpBrasilService.name);

  /**
   * Gera assinatura ICP-Brasil (STUB). Em produção, este método aceita
   * cert + chave e produz CAdES/PAdES validado contra cadeia ICP.
   *
   * @returns `AssinaturaResult` para gravar em coluna JSONB.
   */
  async assinar(input: AssinarInput): Promise<AssinaturaResult> {
    const hasCert =
      typeof input.certPemBase64 === 'string' && input.certPemBase64.length > 0;
    const hasP12 =
      typeof input.p12Base64 === 'string' && input.p12Base64.length > 0;

    const canonical = canonicalJson(input.payload);
    const hash = createHash('sha256').update(canonical, 'utf8').digest('hex');
    const timestamp = new Date().toISOString();

    const certInfo: CertInfo = hasCert || hasP12
      ? this.parseCertStub(input)
      : this.fakeCert(input);

    // Em STUB, "assinatura" é o próprio hash em base64 (placeholder).
    const assinatura = Buffer.from(hash, 'hex').toString('base64');
    const stub = !(hasCert || hasP12);

    this.logger.log(
      {
        algoritmo: stub ? 'SHA256-RSA-STUB' : 'SHA256-RSA',
        hashPrefix: hash.slice(0, 16),
        stub,
        // PHI-safe: NUNCA logamos o payload nem o conteudo.
      },
      'Assinatura digital gerada',
    );

    return {
      certInfo,
      hash,
      timestamp,
      algoritmo: stub ? 'SHA256-RSA-STUB' : 'SHA256-RSA',
      assinatura,
      stub,
    };
  }

  /**
   * Verifica assinatura: refaz o hash do payload e compara.
   * Em produção, valida cadeia + CRL/OCSP. Aqui só o hash.
   */
  async verificar(
    assinatura: AssinaturaResult,
    payloadOriginal: Record<string, unknown>,
  ): Promise<boolean> {
    const canonical = canonicalJson(payloadOriginal);
    const hashAtual = createHash('sha256')
      .update(canonical, 'utf8')
      .digest('hex');
    return hashAtual === assinatura.hash;
  }

  private fakeCert(input: AssinarInput): CertInfo {
    const validade = new Date();
    validade.setUTCFullYear(validade.getUTCFullYear() + 1);
    return {
      titular: input.stubTitular ?? 'PRESTADOR HMS-BR',
      emissor: 'AC HMS-BR DEV',
      validade: validade.toISOString(),
      cpf: input.stubCpf,
      numeroSerie: 'STUB-' + Date.now().toString(36).toUpperCase(),
      simulado: true,
    };
  }

  /** Placeholder — Fase 13 fará parse real do PEM/PKCS#12. */
  private parseCertStub(input: AssinarInput): CertInfo {
    const validade = new Date();
    validade.setUTCFullYear(validade.getUTCFullYear() + 1);
    return {
      titular: input.stubTitular ?? 'CERT IMPORTADO (parse Fase 13)',
      emissor: 'AC ICP-Brasil (parse Fase 13)',
      validade: validade.toISOString(),
      cpf: input.stubCpf,
      numeroSerie: 'IMPORTED-' + Date.now().toString(36).toUpperCase(),
      simulado: false,
    };
  }
}

/**
 * Serialização canônica JSON: chaves ordenadas alfabeticamente em todo
 * objeto. Garante hash estável para mesmos dados independentemente da
 * ordem de inserção.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) {
      out[k] = sortKeys(obj[k]);
    }
    return out;
  }
  return value;
}
