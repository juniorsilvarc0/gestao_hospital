/**
 * Raiz da aplicação. Compõe:
 *
 * - Cross-cutting (Config, Logger, Throttler, EventEmitter, Prisma).
 * - HealthModule (probes).
 * - Os 20 bounded contexts como placeholders. Cada fase posterior
 *   preenche o contexto correspondente sem mexer aqui (apenas no
 *   módulo de cada contexto).
 *
 * Os middlewares globais (correlation-id, tenant-context) são
 * registrados via `configure()`.
 */
import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { configFactory } from './config/configuration';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { TenantContextMiddleware } from './common/middleware/tenant-context.middleware';
import { PrismaModule } from './infrastructure/persistence/prisma.module';
import { QueuesModule } from './infrastructure/queues/queues.module';
import { SecurityModule } from './common/security.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { TenantContextInterceptor } from './common/interceptors/tenant-context.interceptor';
import { SectorFilterInterceptor } from './common/interceptors/sector-filter.interceptor';

import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AuditoriaModule } from './modules/auditoria/auditoria.module';
import { PacientesModule } from './modules/pacientes/pacientes.module';
import { EstruturaFisicaModule } from './modules/estrutura-fisica/estrutura-fisica.module';
import { PrestadoresModule } from './modules/prestadores/prestadores.module';
import { ConveniosModule } from './modules/convenios/convenios.module';
import { CatalogosModule } from './modules/catalogos/catalogos.module';
import { AgendamentoModule } from './modules/agendamento/agendamento.module';
import { PainelChamadaModule } from './modules/painel-chamada/painel-chamada.module';
import { MapaLeitosModule } from './modules/mapa-leitos/mapa-leitos.module';
import { AtendimentosModule } from './modules/atendimentos/atendimentos.module';
import { ExamesModule } from './modules/exames/exames.module';
import { PepModule } from './modules/pep/pep.module';
import { PrescricoesModule } from './modules/prescricoes/prescricoes.module';
import { FarmaciaModule } from './modules/farmacia/farmacia.module';
import { CirurgiasModule } from './modules/cirurgias/cirurgias.module';
import { CentroCirurgicoModule } from './modules/centro-cirurgico/centro-cirurgico.module';
import { ContasModule } from './modules/contas/contas.module';
import { FaturamentoModule } from './modules/faturamento/faturamento.module';
import { TissModule } from './modules/tiss/tiss.module';
import { GlosasModule } from './modules/glosas/glosas.module';
import { RepasseModule } from './modules/repasse/repasse.module';
import { CmeModule } from './modules/cme/cme.module';
import { CcihModule } from './modules/ccih/ccih.module';
import { SameModule } from './modules/same/same.module';
import { VisitantesModule } from './modules/visitantes/visitantes.module';
import { BiModule } from './modules/bi/bi.module';
import { LgpdModule } from './modules/lgpd/lgpd.module';
import { PortalMedicoModule } from './modules/portal-medico/portal-medico.module';
import { PortalPacienteModule } from './modules/portal-paciente/portal-paciente.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configFactory],
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        // Em produção: JSON estruturado direto. Em dev, pino-pretty deixa legível.
        ...(process.env.NODE_ENV !== 'production'
          ? {
              transport: {
                target: 'pino-pretty',
                options: { singleLine: true, translateTime: 'SYS:HH:MM:ss.l' },
              },
            }
          : {}),
        // Garantia LGPD: nenhum PHI no log de request.
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.senha',
            'req.body.password',
            'req.body.cpf',
            'req.body.cns',
            'req.body.dadosClinicos',
          ],
          censor: '[REDACTED]',
        },
        customProps: (req) => ({
          correlationId: (req as { correlationId?: string }).correlationId,
        }),
      },
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 120,
      },
    ]),
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      verboseMemoryLeak: process.env.NODE_ENV !== 'production',
    }),
    PrismaModule,
    QueuesModule,
    SecurityModule,
    HealthModule,
    // Bounded contexts (placeholders Fase 1).
    AuthModule,
    UsersModule,
    AuditoriaModule,
    PacientesModule,
    EstruturaFisicaModule,
    PrestadoresModule,
    ConveniosModule,
    CatalogosModule,
    AgendamentoModule,
    PainelChamadaModule,
    MapaLeitosModule,
    AtendimentosModule,
    ExamesModule,
    PepModule,
    PrescricoesModule,
    FarmaciaModule,
    CirurgiasModule,
    CentroCirurgicoModule,
    ContasModule,
    FaturamentoModule,
    TissModule,
    GlosasModule,
    RepasseModule,
    CmeModule,
    CcihModule,
    SameModule,
    VisitantesModule,
    BiModule,
    LgpdModule,
    PortalMedicoModule,
    PortalPacienteModule,
    WebhooksModule,
  ],
  providers: [
    // Ordem importa: JwtAuthGuard popula request.user; PermissionsGuard
    // depois decide pelo decorator. Guards globais rodam em ordem de
    // declaração.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    // Interceptors: TenantContext envolve TUDO em prisma.$transaction
    // com SET LOCAL — precisa rodar ANTES de SectorFilter (que faz
    // queries via prisma.tx()).
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: SectorFilterInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(CorrelationIdMiddleware, TenantContextMiddleware)
      .forRoutes('*');
  }
}
