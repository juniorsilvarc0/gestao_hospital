/**
 * Port de integração com `IcpBrasilService` (Trilha A — `pep` module).
 *
 * **Por que via port + token e não import direto?**
 *   - A `pep/infrastructure/icp-brasil.service.ts` existe (Round 1
 *     entregou o stub), mas o `PepModule` ainda é placeholder vazio
 *     e NÃO exporta o serviço. Trilha A R2 vai expor; até lá, importar
 *     a classe concreta criaria dependência circular de boot.
 *   - Esse port define o contrato mínimo. Quando Trilha A publicar o
 *     `IcpBrasilService` via `PepModule.exports`, basta:
 *       1. importar `PepModule` em `ExamesModule` (já com forwardRef
 *          em caso de ciclo);
 *       2. trocar o provider:
 *          `{ provide: ICP_BRASIL_SIGNER, useExisting: IcpBrasilService }`.
 *   - Enquanto isso, `LocalIcpBrasilStub` cumpre o contrato em dev/CI.
 *
 * Contrato:
 *   - `assinar(payload)` → `{ assinaturaId, jsonb, assinadoEm }` para
 *     gravar `resultados_exame.assinatura_digital` (JSONB) e
 *     `resultados_exame.assinado_em` (TIMESTAMPTZ).
 *
 * Esse stub NÃO é seguro para produção. CLAUDE.md §2.2 e RN-PEP-02
 * exigem cadeia ICP-Brasil real + CRL/OCSP — entregue na Fase 13.
 *
 * Mantemos o tipo idêntico ao port da Trilha A em
 * `prescricoes/infrastructure/icp-brasil.port.ts`. Se o real do PEP
 * usar outro shape, basta um adapter neste arquivo.
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';

export const ICP_BRASIL_SIGNER = 'ICP_BRASIL_SIGNER_EXAMES' as const;

export interface IcpBrasilSignaturePayload {
  /** Conteúdo a assinar — será serializado e hasheado SHA-256. */
  conteudo: Record<string, unknown> | string;
  /** Identidade do signatário (já validada pelo handler). */
  signatario: {
    usuarioId: bigint;
    prestadorId: bigint | null;
  };
  /** Tipo de documento que está sendo assinado (logging/auditoria). */
  documentoTipo:
    | 'PRESCRICAO'
    | 'EVOLUCAO'
    | 'RESULTADO_EXAME'
    | 'DOCUMENTO_EMITIDO';
  /** Bytes brutos do certificado em PEM/P12 (Fase 13). Stub ignora. */
  certPemBase64?: string;
  p12Base64?: string;
  p12Senha?: string;
}

export interface IcpBrasilSignatureResult {
  /** ID estável da assinatura. */
  assinaturaId: string;
  /** Conteúdo do JSONB `assinatura_digital`. */
  jsonb: {
    assinaturaId: string;
    certInfo: {
      issuer: string;
      subject: string;
      serial: string;
      notBefore: string;
      notAfter: string;
    };
    hash: string; // SHA-256 hex do conteúdo assinado
    timestamp: string; // ISO 8601
    algoritmo: string; // ex.: 'SHA256withRSA' (AD-RB ICP-Brasil)
    stub: boolean; // verdadeiro até Fase 13
  };
  /** Momento da assinatura — caller usa para `assinado_em`. */
  assinadoEm: Date;
}

export interface IcpBrasilSigner {
  assinar(
    payload: IcpBrasilSignaturePayload,
  ): Promise<IcpBrasilSignatureResult>;
}

/**
 * Stub local — provider default enquanto Trilha A não exporta o real.
 *
 * Quando o PepModule expuser o `IcpBrasilService`, troque o registro
 * em `exames.module.ts` para:
 *   `{ provide: ICP_BRASIL_SIGNER, useExisting: IcpBrasilService }`.
 */
@Injectable()
export class LocalIcpBrasilStub implements IcpBrasilSigner {
  private readonly logger = new Logger(LocalIcpBrasilStub.name);

  constructor(
    @Optional()
    @Inject('ICP_BRASIL_DEV_CERT_INFO_EXAMES')
    private readonly certInfoOverride?: IcpBrasilSignatureResult['jsonb']['certInfo'],
  ) {}

  async assinar(
    payload: IcpBrasilSignaturePayload,
  ): Promise<IcpBrasilSignatureResult> {
    const assinaturaId = randomUUID();
    const conteudoStr =
      typeof payload.conteudo === 'string'
        ? payload.conteudo
        : JSON.stringify(canonicalize(payload.conteudo));
    const hash = createHash('sha256').update(conteudoStr).digest('hex');
    const now = new Date();
    const certInfo = this.certInfoOverride ?? {
      issuer: 'AC HMS-BR DEV',
      subject: `usuario:${payload.signatario.usuarioId.toString()}`,
      serial: '00DEV0000',
      notBefore: '2026-01-01T00:00:00Z',
      notAfter: '2030-12-31T23:59:59Z',
    };
    this.logger.warn(
      {
        documentoTipo: payload.documentoTipo,
        usuarioId: payload.signatario.usuarioId.toString(),
      },
      'ICP-Brasil stub: assinatura simulada (NÃO use em produção)',
    );
    return {
      assinaturaId,
      assinadoEm: now,
      jsonb: {
        assinaturaId,
        certInfo,
        hash,
        timestamp: now.toISOString(),
        algoritmo: 'SHA256withRSA',
        stub: true,
      },
    };
  }
}

/**
 * Canonicalização determinística: chaves ordenadas alfabeticamente.
 * Garante hash estável para mesmos campos independente da ordem do
 * JSON.stringify nativo (que segue ordem de inserção).
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) {
      out[k] = canonicalize(obj[k]);
    }
    return out;
  }
  return value;
}
