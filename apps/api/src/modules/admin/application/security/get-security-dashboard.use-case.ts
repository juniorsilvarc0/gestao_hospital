/**
 * `GET /v1/admin/security/dashboard` — agregados de eventos de segurança
 * cross-tenant (apenas ADMIN_GLOBAL).
 *
 * Janela:
 *   - `dias` opcional (1..365, default 30). `inicio = now - dias`,
 *     `fim = now` (ISO8601).
 *
 * Saída:
 *   {
 *     periodo: { dias, inicio, fim },
 *     totalEventos,
 *     porSeveridade: { CRITICO, ALERTA, WARNING, INFO },
 *     porTipo: [{ tipo, qtd }, ...],         // top
 *     topIps: [{ ip, qtdEventos, tiposBloqueio }, ...],  // top 10
 *     ultimosCriticos: [...10 mais recentes ALERTA/CRITICO],
 *     porTenant: [{ tenantUuid, tenantCodigo, tenantNome, qtd }, ...top 5]
 *   }
 *
 * Performance: cada agregado é uma query separada (mais simples,
 * mantém o SQL legível). Para 30 dias ainda fica bem dentro de 200ms
 * com índices `ix_audit_sec_*`. Se virar gargalo, materialização em
 * `mv_security_dashboard` (view materializada Phase 13+).
 */
import { Injectable } from '@nestjs/common';

import { AdminRepository } from '../../infrastructure/admin.repository';
import type { GetSecurityDashboardQueryDto } from '../../dto/list-security-query.dto';
import type {
  SecurityDashboardResponse,
  SecurityDashboardSeveridadeBreakdown,
} from '../../dto/responses';
import { presentSecurityEvent } from './security.presenter';

const TOP_TIPOS = 20;
const TOP_IPS = 10;
const TOP_TENANTS = 5;
const ULTIMOS_CRITICOS = 10;

@Injectable()
export class GetSecurityDashboardUseCase {
  constructor(private readonly repo: AdminRepository) {}

  async execute(
    query: GetSecurityDashboardQueryDto,
  ): Promise<SecurityDashboardResponse> {
    const dias = query.dias ?? 30;
    const fim = new Date();
    const inicio = new Date(fim.getTime() - dias * 24 * 60 * 60 * 1000);

    const [
      total,
      porSeveridadeRows,
      porTipoRows,
      topIpsRows,
      ultimosCriticosRows,
      porTenantRows,
    ] = await Promise.all([
      this.repo.countEventsInWindow(dias),
      this.repo.aggregateBySeveridade(dias),
      this.repo.aggregateByTipo(dias),
      this.repo.aggregateByIp(dias, TOP_IPS),
      this.repo.findRecentCriticalEvents(dias, ULTIMOS_CRITICOS),
      this.repo.aggregateByTenantWithName(dias, TOP_TENANTS),
    ]);

    const porSeveridade: SecurityDashboardSeveridadeBreakdown = {
      CRITICO: 0,
      ALERTA: 0,
      WARNING: 0,
      INFO: 0,
    };
    for (const r of porSeveridadeRows) {
      if (
        r.key === 'CRITICO' ||
        r.key === 'ALERTA' ||
        r.key === 'WARNING' ||
        r.key === 'INFO'
      ) {
        porSeveridade[r.key] = r.count;
      }
    }

    return {
      janela: {
        dias,
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
      },
      periodo: {
        dias,
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
      },
      totalEventos: total,
      porSeveridade,
      porTipo: porTipoRows.slice(0, TOP_TIPOS).map((r) => ({
        tipo: r.key,
        count: r.count,
      })),
      topIps: topIpsRows.map((r) => ({
        ip: r.ip,
        qtdEventos: r.count,
        tiposBloqueio: r.bloqueioTipos,
      })),
      ultimosCriticos: ultimosCriticosRows.map(presentSecurityEvent),
      porTenant: porTenantRows.map((r) => ({
        tenantUuid: r.tenantUuid,
        tenantCodigo: r.tenantCodigo,
        tenantNome: r.tenantNome,
        qtd: r.count,
      })),
    };
  }
}
