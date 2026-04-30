/**
 * Use case: `POST /v1/convenios/:uuid/condicoes-contratuais` — cria
 * uma NOVA versão da condição contratual (B7).
 *
 * Regras de versionamento (DB.md §7.2):
 *   - Constraint UNIQUE (convenio_id, plano_id, versao). `versao` é
 *     calculada como `max(versao) + 1` dentro do escopo (convenio, plano).
 *     `plano_id` pode ser NULL (condição-mãe do convênio inteiro) — para
 *     o `findFirst` usamos OR com `null`.
 *   - Vigências:
 *       • `vigencia_inicio` obrigatório.
 *       • `vigencia_fim` opcional → vigência aberta.
 *       • CHECK `ck_cc_vigencia` no banco protege contra fim < início.
 *   - Não fechamos automaticamente versão anterior (overlap permitido):
 *     o ponto de verdade é a query `findVigente(data)` que escolhe a
 *     versão mais alta com `inicio <= data <= COALESCE(fim, +∞)`.
 *
 * Auditoria APP-LEVEL: `convenio.condicao_contratual.versioned`.
 *
 * Concorrência: a tx do request já roda em ReadCommitted; corrida entre
 * dois POSTs simultâneos é impedida pela UNIQUE — em P2002 retornamos
 * 409 e o cliente pode reenviar.
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../common/context/request-context';
import { AuditoriaService } from '../../auditoria/application/auditoria.service';
import type { CreateCondicaoContratualDto } from '../dto/create-condicao-contratual.dto';
import type { CondicaoContratualResponse } from '../dto/convenio.response';
import {
  presentCondicaoContratual,
  type CondicaoContratualRow,
} from './convenio.presenter';

const CC_INCLUDE = {
  convenios: { select: { uuid_externo: true } },
  planos: { select: { uuid_externo: true } },
} satisfies Prisma.condicoes_contratuaisInclude;

@Injectable()
export class CreateCondicaoContratualUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    convenioUuid: string,
    dto: CreateCondicaoContratualDto,
  ): Promise<CondicaoContratualResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error(
        'CreateCondicaoContratualUseCase requires a request context.',
      );
    }
    const tx = this.prisma.tx();

    const convenio = await tx.convenios.findFirst({
      where: { uuid_externo: convenioUuid, deleted_at: null },
      select: { id: true },
    });
    if (convenio === null) {
      throw new NotFoundException({
        code: 'CONVENIO_NOT_FOUND',
        message: 'Convênio não encontrado.',
      });
    }

    let planoId: bigint | null = null;
    if (dto.planoUuid !== undefined) {
      const plano = await tx.planos.findFirst({
        where: { uuid_externo: dto.planoUuid, deleted_at: null },
        select: { id: true, convenio_id: true },
      });
      if (plano === null) {
        throw new NotFoundException({
          code: 'PLANO_NOT_FOUND',
          message: 'Plano não encontrado.',
        });
      }
      if (plano.convenio_id !== convenio.id) {
        throw new UnprocessableEntityException({
          code: 'PLANO_CONVENIO_MISMATCH',
          message: 'Plano não pertence ao convênio informado.',
        });
      }
      planoId = plano.id;
    }

    // Validação de vigência (CHECK no banco também cobre, mas damos erro
    // estruturado pré-INSERT).
    const inicio = new Date(dto.vigenciaInicio);
    const fim = dto.vigenciaFim ? new Date(dto.vigenciaFim) : null;
    if (Number.isNaN(inicio.getTime())) {
      throw new UnprocessableEntityException({
        code: 'CC_VIGENCIA_INVALIDA',
        message: 'vigenciaInicio inválida.',
      });
    }
    if (fim !== null && fim < inicio) {
      throw new UnprocessableEntityException({
        code: 'CC_VIGENCIA_INVALIDA',
        message: 'vigenciaFim deve ser >= vigenciaInicio.',
      });
    }

    // Calcula próxima versão (escopo: convenio + plano). Para `plano_id IS NULL`,
    // findFirst não cobre — usamos aggregate com filtro explícito.
    const lastVersao = await tx.condicoes_contratuais.aggregate({
      where: {
        convenio_id: convenio.id,
        plano_id: planoId,
      },
      _max: { versao: true },
    });
    const nextVersao = (lastVersao._max.versao ?? 0) + 1;

    let row: CondicaoContratualRow;
    try {
      row = (await tx.condicoes_contratuais.create({
        data: {
          tenant_id: ctx.tenantId,
          convenio_id: convenio.id,
          plano_id: planoId,
          versao: nextVersao,
          vigencia_inicio: inicio,
          vigencia_fim: fim,
          coberturas: dto.coberturas as unknown as Prisma.InputJsonValue,
          especialidades_habilitadas:
            dto.especialidadesHabilitadas !== undefined
              ? (dto.especialidadesHabilitadas as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          agrupamentos:
            dto.agrupamentos !== undefined
              ? (dto.agrupamentos as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          parametros_tiss:
            dto.parametrosTiss !== undefined
              ? (dto.parametrosTiss as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          iss_aliquota:
            dto.issAliquota !== undefined
              ? new Prisma.Decimal(dto.issAliquota)
              : null,
          iss_retem: dto.issRetem ?? false,
          exige_autorizacao_internacao: dto.exigeAutorizacaoInternacao ?? true,
          exige_autorizacao_opme: dto.exigeAutorizacaoOpme ?? true,
          prazo_envio_lote_dias: dto.prazoEnvioLoteDias ?? 30,
        },
        include: CC_INCLUDE,
      })) as unknown as CondicaoContratualRow;
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'CC_VERSAO_CONCORRENTE',
          message:
            'Outra requisição criou uma nova versão simultaneamente. Reenvie.',
        });
      }
      throw err;
    }

    await this.auditoria.record({
      tabela: 'condicoes_contratuais',
      registroId: convenio.id,
      operacao: 'I',
      diff: {
        evento: 'convenio.condicao_contratual.versioned',
        convenio_id: convenio.id.toString(),
        plano_id: planoId === null ? null : planoId.toString(),
        nova_versao: nextVersao,
        vigencia_inicio: inicio.toISOString().slice(0, 10),
        vigencia_fim: fim ? fim.toISOString().slice(0, 10) : null,
      },
      finalidade: 'cadastro.convenio.condicao_contratual',
    });

    return presentCondicaoContratual(row);
  }
}
