/**
 * `POST /v1/repasse/reapurar` — força reapuração manual de uma conta.
 *
 * Fluxo: localiza glosas resolvidas vinculadas à conta e re-emite o
 * efeito de cada uma (delegando ao `HandleGlosaResolvidaUseCase`).
 *
 * Para a versão simples desta entrega, faz a leitura das glosas via
 * SQL direto e processa todas. Em produção, este endpoint costuma
 * ser usado para casos pontuais (ex.: corrigir um repasse perdido por
 * race em listener) — o operador deve revisar os efeitos no painel.
 */
import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import { RequestContextStorage } from '../../../../common/context/request-context';
import type { ReapurarDto } from '../../dto/reapurar.dto';
import { RepasseRepository } from '../../infrastructure/repasse.repository';
import {
  HandleGlosaResolvidaUseCase,
  type GlosaResolvidaEventPayload,
} from './handle-glosa-resolvida.use-case';

interface GlosaResolvidaRow {
  uuid_externo: string;
  status: string;
  valor_revertido: string;
}

@Injectable()
export class ReapurarContaUseCase {
  private readonly logger = new Logger(ReapurarContaUseCase.name);

  constructor(
    private readonly repo: RepasseRepository,
    private readonly handler: HandleGlosaResolvidaUseCase,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(dto: ReapurarDto): Promise<{
    contaUuid: string;
    glosasProcessadas: number;
    motivo: string;
  }> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new UnprocessableEntityException({
        code: 'CONTEXT_REQUIRED',
        message: 'Operação requer request context autenticado.',
      });
    }

    const conta = await this.repo.findContaByUuid(dto.contaUuid);
    if (conta === null) {
      throw new NotFoundException({
        code: 'CONTA_NOT_FOUND',
        message: 'Conta não encontrada.',
      });
    }

    // Lê glosas RESOLVIDAS da conta (status terminal != EM_RECURSO).
    const glosas = await ctx.tx.$queryRaw<GlosaResolvidaRow[]>`
      SELECT uuid_externo::text AS uuid_externo,
             status::text       AS status,
             valor_revertido::text AS valor_revertido
        FROM glosas
       WHERE conta_id = ${conta.id}::bigint
         AND status IN (
           'REVERTIDA_TOTAL'::enum_glosa_status,
           'REVERTIDA_PARCIAL'::enum_glosa_status,
           'ACATADA'::enum_glosa_status,
           'PERDA_DEFINITIVA'::enum_glosa_status
         )
    `;

    if (glosas.length === 0) {
      throw new UnprocessableEntityException({
        code: 'NENHUMA_GLOSA_RESOLVIDA',
        message:
          'Conta não possui glosas em estado terminal — nada a reapurar.',
      });
    }

    let processadas = 0;
    for (const g of glosas) {
      const payload: GlosaResolvidaEventPayload = {
        glosaUuid: g.uuid_externo,
        contaUuid: dto.contaUuid,
        status: g.status,
        valorRevertido: g.valor_revertido,
      };
      try {
        await this.handler.execute(payload);
        processadas += 1;
      } catch (err: unknown) {
        this.logger.warn(
          {
            err: err instanceof Error ? err.message : String(err),
            glosaUuid: g.uuid_externo,
          },
          'Falha ao reapurar glosa — seguindo para próxima.',
        );
      }
    }

    await this.auditoria.record({
      tabela: 'repasses_itens',
      registroId: conta.id,
      operacao: 'I',
      diff: {
        evento: 'repasse.reapurado_manual',
        conta_uuid: dto.contaUuid,
        motivo: dto.motivo,
        glosas_processadas: processadas,
        glosas_total: glosas.length,
      },
      finalidade: 'repasse.reapurado_manual',
    });

    return {
      contaUuid: dto.contaUuid,
      glosasProcessadas: processadas,
      motivo: dto.motivo,
    };
  }
}
