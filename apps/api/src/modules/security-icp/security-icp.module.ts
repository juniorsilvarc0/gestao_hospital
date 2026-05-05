/**
 * Bounded Context: Security ICP-Brasil — Fase 13 / Trilha R-B.
 *
 * Endpoint:
 *   POST /v1/security/icp-brasil/validar
 *
 * Importa `SecurityListenerModule` para reusar o
 * `SecurityEventsRepository` (registra `CERTIFICADO_INVALIDO` quando
 * a validação falha — RN-SEG-08).
 *
 * O validador em si é puro (sem rede). Verificação de revogação
 * (CRL/OCSP) e cadeia ficam como TODO Phase 13+.
 */
import { Module } from '@nestjs/common';

import { SecurityListenerModule } from '../security-listener/security-listener.module';
import { ValidateCertificateUseCase } from './application/validate-certificate.use-case';
import { IcpBrasilController } from './infrastructure/controllers/icp-brasil.controller';

@Module({
  imports: [SecurityListenerModule],
  controllers: [IcpBrasilController],
  providers: [ValidateCertificateUseCase],
  exports: [ValidateCertificateUseCase],
})
export class SecurityIcpModule {}
