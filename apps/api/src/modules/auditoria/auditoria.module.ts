/**
 * Cross-cutting: Auditoria (LGPD).
 *
 * Fase 2 — Trilha C: provê `AuditoriaService` para insert manual em
 * `auditoria_eventos` quando triggers DB não cobrem (ex.: eventos
 * "lógicos" como `auth.profile.changed`).
 *
 * Fases futuras:
 *   - Fase 5: tabela `acessos_prontuario` (PHI access log).
 *   - Fase 12: dashboards e exports LGPD.
 */
import { Global, Module } from '@nestjs/common';

import { AuditoriaService } from './application/auditoria.service';

@Global()
@Module({
  providers: [AuditoriaService],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
