/**
 * `PepAcessoInterceptor` — registra acesso em `acessos_prontuario`
 * (RN-LGP-01 / RN-PEP-07).
 *
 * Uso (decorator nos handlers que LEEM PHI):
 *
 *   @UseInterceptors(PepAcessoInterceptor)
 *
 * Comportamento:
 *   1. Lê header `X-Finalidade`. Sem ele → 400.
 *   2. Resolve `paciente_id` e `atendimento_id` a partir do path
 *      (`:atendimentoUuid` ou `:uuid` no caso de evolucao/documento).
 *   3. INSERT em `acessos_prontuario` (modulo='PEP').
 *   4. Erro de auditoria não derruba a leitura — apenas warning. (Em
 *      ambientes regulados, mude para `throw` aqui e adicione retry.)
 *
 * Heurística para identificar a entidade:
 *   - Path contém `/atendimentos/<uuid>/...` → resolve via atendimento.
 *   - Path contém `/evolucoes/<uuid>` → resolve via JOIN da evolução
 *     pegando atendimento_id+paciente_id. Idem documentos/sinais.
 */
import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from, mergeMap } from 'rxjs';
import type { Request } from 'express';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../common/context/request-context';

const FINALIDADE_HEADER = 'x-finalidade';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class PepAcessoInterceptor implements NestInterceptor {
  private readonly logger = new Logger(PepAcessoInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const finalidadeRaw = (req.headers[FINALIDADE_HEADER] ?? '') as string;
    const finalidade = finalidadeRaw.trim();
    if (finalidade.length === 0) {
      throw new BadRequestException({
        code: 'LGPD_MISSING_PURPOSE',
        message:
          'Header `X-Finalidade` é obrigatório para acesso a prontuário (RN-LGP-01).',
      });
    }

    return from(this.resolveEntities(req)).pipe(
      mergeMap(async (entities) => {
        if (entities !== null) {
          await this.gravarAcesso(
            entities.pacienteId,
            entities.atendimentoId,
            finalidade.slice(0, 200),
            req,
          );
        }
        return next.handle().toPromise();
      }),
      mergeMap((v) => (v instanceof Promise ? from(v) : from(Promise.resolve(v)))),
    );
  }

  private async resolveEntities(
    req: Request,
  ): Promise<{ pacienteId: bigint; atendimentoId: bigint | null } | null> {
    const params = req.params as Record<string, string | undefined>;
    const path = req.path;

    if (
      typeof params.atendimentoUuid === 'string' &&
      UUID_RE.test(params.atendimentoUuid)
    ) {
      return this.findByAtendimentoUuid(params.atendimentoUuid);
    }

    if (typeof params.uuid === 'string' && UUID_RE.test(params.uuid)) {
      if (path.includes('/evolucoes/')) {
        return this.findByEvolucaoUuid(params.uuid);
      }
      if (path.includes('/documentos/')) {
        return this.findByDocumentoUuid(params.uuid);
      }
    }

    // Sem entidade identificável — não grava (não bloqueia leitura).
    return null;
  }

  private async findByAtendimentoUuid(
    uuid: string,
  ): Promise<{ pacienteId: bigint; atendimentoId: bigint | null } | null> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) return null;
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { id: bigint; paciente_id: bigint }[]
    >`SELECT id, paciente_id FROM atendimentos WHERE uuid_externo = ${uuid}::uuid LIMIT 1`;
    if (rows.length === 0) return null;
    return { pacienteId: rows[0].paciente_id, atendimentoId: rows[0].id };
  }

  private async findByEvolucaoUuid(
    uuid: string,
  ): Promise<{ pacienteId: bigint; atendimentoId: bigint | null } | null> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) return null;
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { paciente_id: bigint; atendimento_id: bigint }[]
    >`SELECT paciente_id, atendimento_id FROM evolucoes WHERE uuid_externo = ${uuid}::uuid LIMIT 1`;
    if (rows.length === 0) return null;
    return {
      pacienteId: rows[0].paciente_id,
      atendimentoId: rows[0].atendimento_id,
    };
  }

  private async findByDocumentoUuid(
    uuid: string,
  ): Promise<{ pacienteId: bigint; atendimentoId: bigint | null } | null> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) return null;
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { paciente_id: bigint; atendimento_id: bigint | null }[]
    >`SELECT paciente_id, atendimento_id FROM documentos_emitidos WHERE uuid_externo = ${uuid}::uuid LIMIT 1`;
    if (rows.length === 0) return null;
    return {
      pacienteId: rows[0].paciente_id,
      atendimentoId: rows[0].atendimento_id,
    };
  }

  private async gravarAcesso(
    pacienteId: bigint,
    atendimentoId: bigint | null,
    finalidade: string,
    req: Request,
  ): Promise<void> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) return;
    const perfil = req.user?.perfis?.[0] ?? 'DESCONHECIDO';
    const ip = req.ip ?? null;
    try {
      const tx = this.prisma.tx();
      await tx.$executeRaw`
        INSERT INTO acessos_prontuario
          (tenant_id, paciente_id, atendimento_id, usuario_id, perfil,
           finalidade, modulo, ip)
        VALUES
          (${ctx.tenantId}::bigint,
           ${pacienteId}::bigint,
           ${atendimentoId}::bigint,
           ${ctx.userId}::bigint,
           ${perfil},
           ${finalidade},
           'PEP',
           ${ip}::inet)
      `;
    } catch (err: unknown) {
      this.logger.warn(
        {
          err: err instanceof Error ? err.message : String(err),
          // PHI-safe: não logamos paciente_id em produção.
        },
        'Falha registrando acesso_prontuario (LGPD)',
      );
    }
  }
}
