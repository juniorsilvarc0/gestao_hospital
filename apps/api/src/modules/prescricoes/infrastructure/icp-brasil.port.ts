/**
 * Port de integração com o `IcpBrasilService` (Trilha A — `pep` module).
 *
 * **Por que via port + token e não import direto?**
 *   - Trilha A entrega o serviço real em paralelo. Importar a classe
 *     concreta da `pep` criaria uma dependência circular de boot e
 *     forçaria nossa branch a esperar o merge dela.
 *   - Esse port define o contrato mínimo. Quando Trilha A publicar o
 *     `IcpBrasilService` (em `apps/api/src/modules/pep/...`) e
 *     exportá-lo via `PepModule`, basta:
 *       1. importar `PepModule` no `PrescricoesModule`/`ExamesModule`
 *          (já configurado com `forwardRef` se necessário);
 *       2. registrar o provider concreto sob este token:
 *          `{ provide: ICP_BRASIL_SIGNER, useExisting: IcpBrasilService }`.
 *   - Enquanto isso, o `LocalIcpBrasilStub` abaixo cumpre o contrato
 *     com dados mínimos (cert "AC HMS-BR DEV") — coerente com
 *     `apps/api/src/modules/pep/dto/assinar.dto.ts` (Trilha A já
 *     prevê stub em dev).
 *
 * Contrato:
 *   - `assinar(payload)` → devolve `{ assinaturaId, certInfo, hash,
 *     timestamp, algoritmo }` para gravar como JSONB em
 *     `prescricoes.assinatura_digital` ou `resultados_exame.assinatura_digital`.
 *   - `verificar(assinatura)` → opcional para a fase atual (Fase 13
 *     adiciona CRL/OCSP).
 *
 * Esse stub NÃO é seguro para produção. CLAUDE.md §2.2 e RN-PEP-02
 * exigem cadeia ICP-Brasil real + CRL/OCSP — entregue na Fase 13.
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';

export const ICP_BRASIL_SIGNER = 'ICP_BRASIL_SIGNER' as const;

export interface IcpBrasilSignaturePayload {
  /** Conteúdo a assinar — será serializado e hasheado SHA-256. */
  conteudo: Record<string, unknown> | string;
  /** Identidade do signatário (já validado pelo handler). */
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
  /** ID estável da assinatura para guardar em `assinatura_digital_id`. */
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
    hash: string;       // SHA-256 hex do conteúdo assinado
    timestamp: string;  // ISO 8601
    algoritmo: string;  // ex.: 'SHA256withRSA' (AD-RB ICP-Brasil)
    stub: boolean;      // verdadeiro até Fase 13
  };
  /** Momento da assinatura — caller usa para `assinada_em`/`assinado_em`. */
  assinadoEm: Date;
}

export interface IcpBrasilSigner {
  assinar(
    payload: IcpBrasilSignaturePayload,
  ): Promise<IcpBrasilSignatureResult>;
}

/**
 * Stub local — provider default quando Trilha A não tem o real ainda.
 *
 * Coloca-se como fallback opcional: o módulo registra
 * `{ provide: ICP_BRASIL_SIGNER, useClass: LocalIcpBrasilStub }`. Quando
 * Trilha A merger, mudar para `useExisting: IcpBrasilService` (apontando
 * para a classe deles) ou `useFactory` que prefere o real e cai no stub
 * em ambiente dev/CI.
 */
@Injectable()
export class LocalIcpBrasilStub implements IcpBrasilSigner {
  private readonly logger = new Logger(LocalIcpBrasilStub.name);

  constructor(
    @Optional()
    @Inject('ICP_BRASIL_DEV_CERT_INFO')
    private readonly certInfoOverride?: IcpBrasilSignatureResult['jsonb']['certInfo'],
  ) {}

  async assinar(
    payload: IcpBrasilSignaturePayload,
  ): Promise<IcpBrasilSignatureResult> {
    const assinaturaId = randomUUID();
    const conteudoStr =
      typeof payload.conteudo === 'string'
        ? payload.conteudo
        : JSON.stringify(payload.conteudo);
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
