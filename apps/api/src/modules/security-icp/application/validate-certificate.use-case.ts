/**
 * `POST /v1/security/icp-brasil/validar` — orquestra o validador puro
 * e (opcionalmente) registra `CERTIFICADO_INVALIDO` em
 * `audit_security_events`.
 *
 * O endpoint é genérico (chamado pelo Front quando o usuário sobe um
 * certificado para teste, ou pelo motor de assinatura). Em ambos os
 * casos, a invalidação é registrada para trilha de auditoria.
 */
import { Injectable, Logger } from '@nestjs/common';

import { RequestContextStorage } from '../../../common/context/request-context';
import { SecurityEventsRepository } from '../../security-listener/infrastructure/security-events.repository';
import {
  validateCertificate,
  type CertData,
  type ValidationResult,
} from '../domain/icp-brasil-validator';

@Injectable()
export class ValidateCertificateUseCase {
  private readonly logger = new Logger(ValidateCertificateUseCase.name);

  constructor(private readonly securityEvents: SecurityEventsRepository) {}

  async execute(certData: CertData): Promise<ValidationResult> {
    const result = validateCertificate(certData);

    if (!result.valid) {
      const ctx = RequestContextStorage.get();
      await this.securityEvents.insertEvent({
        tipo: 'CERTIFICADO_INVALIDO',
        severidade: 'WARNING',
        usuarioId: ctx?.userId ?? null,
        detalhes: {
          issuer: certData?.issuer ?? null,
          serialNumber: certData?.serialNumber ?? null,
          validFrom: certData?.validFrom ?? null,
          validTo: certData?.validTo ?? null,
          reason: result.reason ?? null,
        },
      });
      this.logger.log(
        { reason: result.reason },
        'security.icp_brasil.certificado_invalido',
      );
    }

    return result;
  }
}
