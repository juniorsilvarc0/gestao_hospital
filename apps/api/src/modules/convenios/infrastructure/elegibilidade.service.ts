/**
 * `ConvenioElegibilidadeService` — verifica elegibilidade do paciente
 * em um convênio (RN-ATE-02).
 *
 * Estratégia (em ordem):
 *
 *   1. Lê `convenios.url_webservice` (do convênio em questão).
 *   2. Se a URL **não** estiver configurada → fallback `MANUAL` com
 *      `elegivel = true` (operador valida no balcão; não bloqueia o
 *      atendimento — recepcionista decide). Audit: `elegibilidade.manual`.
 *   3. Se a URL existir:
 *      a. Cache hit no Redis (`elegib:<tenant>:<convenio>:<carteirinha>:<proc?>`,
 *         TTL 1h) → retorna `fonte: 'CACHE'`.
 *      b. Cache miss → POST HTTP com `AbortController` 10s. Sucesso:
 *         cacheia + retorna `fonte: 'WEBSERVICE'`. Timeout/erro:
 *         fallback `MANUAL` + log `warn` (RN-ATE-02 explícito: webservice
 *         offline **não** pode bloquear o atendimento).
 *   4. Sempre grava `auditoria_eventos` lógico `elegibilidade.consultada`
 *      com `fonte` e `elegivel`.
 *
 * Cache key:
 *   `elegib:<tenantId>:<convenioId>:<carteirinha>:<procedimentoId|"-">`
 *
 * Por que cache 1h?
 *   Operadoras costumam atualizar elegibilidade diariamente. 1h é o
 *   sweet spot entre carga no webservice e janela de divergência —
 *   ajustável via env `ELEGIB_CACHE_TTL_SECONDS`.
 *
 * **Não falha o atendimento.** Esta é a regra dura do RN-ATE-02.
 */
import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import Redis, { type Redis as RedisClient } from 'ioredis';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../common/context/request-context';

const DEFAULT_TTL_SECONDS = 3_600;
const HTTP_TIMEOUT_MS = 10_000;

export type ElegibilidadeFonte = 'WEBSERVICE' | 'CACHE' | 'MANUAL';

export interface ElegibilidadeInput {
  tenantId: bigint;
  pacienteId: bigint;
  convenioId: bigint;
  numeroCarteirinha: string;
  procedimentoId?: bigint | null;
}

export interface ElegibilidadeResult {
  elegivel: boolean;
  fonte: ElegibilidadeFonte;
  detalhes?: string;
  consultadoEm: Date;
  expiraEm: Date;
}

interface ConvenioRow {
  id: bigint;
  nome: string;
  url_webservice: string | null;
}

interface CachedEntry {
  elegivel: boolean;
  detalhes?: string;
  consultadoEm: string;
  expiraEm: string;
}

interface WebServiceResponse {
  elegivel?: boolean;
  motivo?: string;
  detalhes?: string;
}

@Injectable()
export class ConvenioElegibilidadeService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ConvenioElegibilidadeService.name);
  private redis?: RedisClient;
  private readonly ttlSeconds: number;

  constructor(private readonly prisma: PrismaService) {
    const fromEnv = process.env.ELEGIB_CACHE_TTL_SECONDS;
    const parsed = fromEnv === undefined ? NaN : Number.parseInt(fromEnv, 10);
    this.ttlSeconds = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_SECONDS;
  }

  onModuleInit(): void {
    const url = process.env.REDIS_URL;
    if (typeof url === 'string' && url.length > 0) {
      try {
        this.redis = new Redis(url, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        });
        this.redis.connect().catch((err: unknown) => {
          this.logger.warn(
            { err: err instanceof Error ? err.message : String(err) },
            'Redis indisponível — elegibilidade sem cache',
          );
          this.redis = undefined;
        });
      } catch (err) {
        this.logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'Falha ao iniciar cliente Redis para elegibilidade',
        );
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis !== undefined) {
      await this.redis.quit().catch(() => undefined);
    }
  }

  async verificar(input: ElegibilidadeInput): Promise<ElegibilidadeResult> {
    const convenio = await this.carregarConvenio(input.convenioId);
    if (convenio === null) {
      const result = this.buildManualResult(
        'Convênio não encontrado — verificação manual.',
      );
      await this.gravarAuditoria(input, result, 'elegibilidade.manual');
      return result;
    }

    // 1. Sem URL → MANUAL.
    if (
      convenio.url_webservice === null ||
      convenio.url_webservice.trim().length === 0
    ) {
      const result = this.buildManualResult(
        'Convênio sem webservice configurado — verificação manual.',
      );
      await this.gravarAuditoria(input, result, 'elegibilidade.manual');
      return result;
    }

    // 2. Cache.
    const key = this.cacheKey(input);
    const cached = await this.lerCache(key);
    if (cached !== null) {
      const result: ElegibilidadeResult = {
        elegivel: cached.elegivel,
        fonte: 'CACHE',
        detalhes: cached.detalhes,
        consultadoEm: new Date(cached.consultadoEm),
        expiraEm: new Date(cached.expiraEm),
      };
      await this.gravarAuditoria(input, result, 'elegibilidade.consultada');
      return result;
    }

    // 3. Webservice.
    try {
      const response = await this.chamarWebservice(
        convenio.url_webservice,
        input,
      );
      const consultadoEm = new Date();
      const expiraEm = new Date(consultadoEm.getTime() + this.ttlSeconds * 1000);
      const result: ElegibilidadeResult = {
        elegivel: response.elegivel ?? false,
        fonte: 'WEBSERVICE',
        detalhes: response.detalhes ?? response.motivo,
        consultadoEm,
        expiraEm,
      };
      await this.gravarCache(key, result);
      await this.gravarAuditoria(input, result, 'elegibilidade.consultada');
      return result;
    } catch (err) {
      this.logger.warn(
        {
          convenioId: input.convenioId.toString(),
          err: err instanceof Error ? err.message : String(err),
        },
        'elegibilidade: webservice indisponível — fallback MANUAL',
      );
      const result = this.buildManualResult(
        'Webservice de elegibilidade indisponível — verificação manual no balcão.',
      );
      // Webservice CONFIGURADO mas falhou → ainda é "consultada" (a
      // intenção foi consultar), só caiu no fallback. Mantemos
      // `elegibilidade.consultada` para diferenciar do caso "convênio
      // sem webservice" no painel de auditoria.
      await this.gravarAuditoria(input, result, 'elegibilidade.consultada');
      return result;
    }
  }

  private buildManualResult(detalhes: string): ElegibilidadeResult {
    const consultadoEm = new Date();
    const expiraEm = new Date(consultadoEm.getTime() + this.ttlSeconds * 1000);
    return {
      elegivel: true,
      fonte: 'MANUAL',
      detalhes,
      consultadoEm,
      expiraEm,
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // helpers
  // ──────────────────────────────────────────────────────────────────

  private async carregarConvenio(id: bigint): Promise<ConvenioRow | null> {
    const tx = this.prisma.tx();
    const row = await tx.convenios.findFirst({
      where: { id, deleted_at: null },
      select: { id: true, nome: true, url_webservice: true },
    });
    if (row === null) {
      return null;
    }
    return {
      id: row.id,
      nome: row.nome,
      url_webservice: row.url_webservice ?? null,
    };
  }

  private cacheKey(input: ElegibilidadeInput): string {
    const proc =
      input.procedimentoId !== undefined && input.procedimentoId !== null
        ? input.procedimentoId.toString()
        : '-';
    return `elegib:${input.tenantId.toString()}:${input.convenioId.toString()}:${input.numeroCarteirinha}:${proc}`;
  }

  private async lerCache(key: string): Promise<CachedEntry | null> {
    if (this.redis === undefined || this.redis.status !== 'ready') {
      return null;
    }
    try {
      const raw = await this.redis.get(key);
      if (raw === null) {
        return null;
      }
      const parsed = JSON.parse(raw) as CachedEntry;
      // Sanity: se já expirou no relógio (clock-skew), ignora.
      if (new Date(parsed.expiraEm).getTime() < Date.now()) {
        return null;
      }
      return parsed;
    } catch (err) {
      this.logger.debug(
        { err: err instanceof Error ? err.message : String(err) },
        'elegibilidade: GET cache falhou (não-fatal)',
      );
      return null;
    }
  }

  private async gravarCache(
    key: string,
    result: ElegibilidadeResult,
  ): Promise<void> {
    if (this.redis === undefined || this.redis.status !== 'ready') {
      return;
    }
    try {
      const entry: CachedEntry = {
        elegivel: result.elegivel,
        detalhes: result.detalhes,
        consultadoEm: result.consultadoEm.toISOString(),
        expiraEm: result.expiraEm.toISOString(),
      };
      await this.redis.set(
        key,
        JSON.stringify(entry),
        'EX',
        this.ttlSeconds,
      );
    } catch (err) {
      this.logger.debug(
        { err: err instanceof Error ? err.message : String(err) },
        'elegibilidade: SET cache falhou (não-fatal)',
      );
    }
  }

  private async chamarWebservice(
    url: string,
    input: ElegibilidadeInput,
  ): Promise<WebServiceResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    try {
      const body = JSON.stringify({
        carteirinha: input.numeroCarteirinha,
        pacienteId: input.pacienteId.toString(),
        procedimentoId:
          input.procedimentoId !== undefined && input.procedimentoId !== null
            ? input.procedimentoId.toString()
            : null,
      });
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Webservice respondeu ${response.status}`);
      }
      const json = (await response.json()) as WebServiceResponse;
      // Defesa contra resposta mal-formada.
      if (typeof json !== 'object' || json === null) {
        throw new Error('Resposta do webservice não é JSON object');
      }
      return json;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Grava `auditoria_eventos` lógico. Best-effort — falha não bloqueia
   * a verificação. Usa o request-context para `tenant_id`/`usuario_id`/
   * `correlation_id`.
   *
   * `evento` distingue:
   *   - `elegibilidade.manual`     — convênio sem webservice OU não
   *      encontrado (sem intenção de bater no externo).
   *   - `elegibilidade.consultada` — caminho com webservice (CACHE,
   *      WEBSERVICE ok ou WEBSERVICE com fallback MANUAL após falha).
   */
  private async gravarAuditoria(
    input: ElegibilidadeInput,
    result: ElegibilidadeResult,
    evento: 'elegibilidade.manual' | 'elegibilidade.consultada',
  ): Promise<void> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      return;
    }
    const tx = this.prisma.tx();
    const diff = {
      evento,
      fonte: result.fonte,
      elegivel: result.elegivel,
      convenio_id: input.convenioId.toString(),
      paciente_id: input.pacienteId.toString(),
      procedimento_id:
        input.procedimentoId !== undefined && input.procedimentoId !== null
          ? input.procedimentoId.toString()
          : null,
      detalhes: result.detalhes ?? null,
    };
    try {
      await tx.$executeRaw`
        INSERT INTO auditoria_eventos
          (tenant_id, tabela, registro_id, operacao, diff,
           usuario_id, finalidade, correlation_id)
        VALUES
          (${ctx.tenantId}::bigint,
           'convenios',
           ${input.convenioId}::bigint,
           'S',
           ${JSON.stringify(diff)}::jsonb,
           ${ctx.userId}::bigint,
           ${evento},
           ${ctx.correlationId}::uuid)
      `;
    } catch (err) {
      this.logger.warn(
        {
          convenioId: input.convenioId.toString(),
          err: err instanceof Error ? err.message : String(err),
        },
        'elegibilidade: falha gravando auditoria (não-fatal)',
      );
    }
  }
}
