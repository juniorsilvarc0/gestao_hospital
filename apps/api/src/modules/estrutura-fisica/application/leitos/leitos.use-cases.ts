/**
 * Use cases de `leitos` — CRUD + transição de status com otimistic
 * lock.
 *
 * A criação não permite definir `status`; ele começa em `DISPONIVEL`
 * (default Postgres). Mudanças de status passam pelo
 * `LeitoStatusMachine`. Alocação completa (status=OCUPADO com
 * `paciente_id` + `atendimento_id`) é exclusividade da Fase 5 — aqui
 * apenas mantemos o caminho de transição administrativo.
 */
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Prisma,
  enum_leito_status as LeitoStatus,
  enum_leito_tipo_acomodacao as LeitoTipoAcomodacao,
} from '@prisma/client';

import { PrismaService } from '../../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../../common/context/request-context';
import {
  ChangeLeitoStatusDto,
  CreateLeitoDto,
  LeitoMapaSetor,
  LeitoResponse,
  ListLeitosQueryDto,
  UpdateLeitoDto,
} from '../../dto/leito.dto';
import { PaginatedResponse, paginate, toBigInt } from '../../dto/common';
import { LeitoStatusMachine } from '../../infrastructure/leito-status.machine';
import {
  LEITO_EVENT_NAMES,
  type LeitoBloqueadoEventPayload,
  type LeitoDisponivelEventPayload,
  type LeitoHigienizandoEventPayload,
  type LeitoManutencaoEventPayload,
  type LeitoReservadoEventPayload,
} from '../../../mapa-leitos/events/leito.events';

interface LeitoRow {
  id: bigint;
  codigo: string;
  setor_id: bigint;
  tipo_acomodacao: LeitoTipoAcomodacao;
  status: LeitoStatus;
  paciente_id: bigint | null;
  atendimento_id: bigint | null;
  ocupacao_iniciada_em: Date | null;
  ocupacao_prevista_fim: Date | null;
  extra: boolean;
  observacao: string | null;
  versao: number;
  ativo: boolean;
  created_at: Date;
  updated_at: Date | null;
}

function toResponse(row: LeitoRow): LeitoResponse {
  return {
    id: row.id.toString(),
    codigo: row.codigo,
    setorId: row.setor_id.toString(),
    tipoAcomodacao: row.tipo_acomodacao,
    status: row.status,
    extra: row.extra,
    observacao: row.observacao,
    ativo: row.ativo,
    versao: row.versao,
    ocupacaoIniciadaEm: row.ocupacao_iniciada_em
      ? row.ocupacao_iniciada_em.toISOString()
      : null,
    ocupacaoPrevistaFim: row.ocupacao_prevista_fim
      ? row.ocupacao_prevista_fim.toISOString()
      : null,
    pacienteId: row.paciente_id ? row.paciente_id.toString() : null,
    atendimentoId: row.atendimento_id ? row.atendimento_id.toString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
  };
}

function requireTenantId(): bigint {
  const ctx = RequestContextStorage.get();
  if (ctx === undefined) {
    throw new Error('leitos use case requires authenticated request context.');
  }
  return ctx.tenantId;
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: 'LEITO_NOT_FOUND',
    message: 'Leito não encontrado.',
  });
}

function parseId(raw: string): bigint {
  try {
    return toBigInt(raw);
  } catch {
    throw notFound();
  }
}

async function ensureSetor(
  tx: ReturnType<PrismaService['tx']>,
  id: bigint,
): Promise<{ id: bigint; nome: string }> {
  const found = await tx.setores.findFirst({
    where: { id, deleted_at: null },
    select: { id: true, nome: true },
  });
  if (found === null) {
    throw new UnprocessableEntityException({
      code: 'LEITO_SETOR_INVALIDO',
      message: 'Setor informado não existe.',
    });
  }
  return found;
}

@Injectable()
export class ListLeitosUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    query: ListLeitosQueryDto,
  ): Promise<PaginatedResponse<LeitoResponse>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const tx = this.prisma.tx();
    const where: Prisma.leitosWhereInput = { deleted_at: null };
    if (query.setor_id !== undefined) where.setor_id = parseId(query.setor_id);
    if (query.status !== undefined) where.status = query.status;
    if (query.ativo !== undefined) where.ativo = query.ativo;
    if (query.search !== undefined && query.search.length > 0) {
      where.codigo = { contains: query.search, mode: 'insensitive' };
    }

    const [total, items] = await Promise.all([
      tx.leitos.count({ where }),
      tx.leitos.findMany({
        where,
        orderBy: [{ setor_id: 'asc' }, { codigo: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return paginate(items as LeitoRow[], total, page, pageSize, toResponse);
  }
}

@Injectable()
export class GetLeitoUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(idRaw: string): Promise<LeitoResponse> {
    const id = parseId(idRaw);
    const tx = this.prisma.tx();
    const row = await tx.leitos.findFirst({ where: { id, deleted_at: null } });
    if (row === null) throw notFound();
    return toResponse(row as LeitoRow);
  }
}

@Injectable()
export class GetLeitosMapaUseCase {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Agrupa leitos por setor com totais por status. Fase 5 evolui
   * isto para WebSocket; aqui devolvemos snapshot REST.
   */
  async execute(): Promise<LeitoMapaSetor[]> {
    const tx = this.prisma.tx();
    const setores = (await tx.setores.findMany({
      where: { deleted_at: null, ativo: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    })) as Array<{ id: bigint; nome: string }>;

    const leitos = (await tx.leitos.findMany({
      where: { deleted_at: null },
      orderBy: [{ setor_id: 'asc' }, { codigo: 'asc' }],
    })) as LeitoRow[];

    const porSetor = new Map<string, LeitoRow[]>();
    for (const leito of leitos) {
      const key = leito.setor_id.toString();
      const list = porSetor.get(key) ?? [];
      list.push(leito);
      porSetor.set(key, list);
    }

    const out: LeitoMapaSetor[] = [];
    for (const setor of setores) {
      const setorKey = setor.id.toString();
      const list = porSetor.get(setorKey) ?? [];
      if (list.length === 0) continue;
      const totais: Record<LeitoStatus, number> = {
        DISPONIVEL: 0,
        OCUPADO: 0,
        RESERVADO: 0,
        HIGIENIZACAO: 0,
        MANUTENCAO: 0,
        BLOQUEADO: 0,
      };
      for (const l of list) totais[l.status] += 1;
      out.push({
        setorId: setorKey,
        setorNome: setor.nome,
        totais,
        leitos: list.map(toResponse),
      });
    }
    return out;
  }
}

@Injectable()
export class CreateLeitoUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(dto: CreateLeitoDto): Promise<LeitoResponse> {
    const tenantId = requireTenantId();
    const tx = this.prisma.tx();
    const setorId = parseId(dto.setorId);
    await ensureSetor(tx, setorId);

    try {
      const created = await tx.leitos.create({
        data: {
          tenant_id: tenantId,
          setor_id: setorId,
          codigo: dto.codigo,
          tipo_acomodacao: dto.tipoAcomodacao,
          extra: dto.extra ?? false,
          observacao: dto.observacao ?? null,
          // status, versao, ativo usam defaults do Prisma/DB.
        },
      });
      return toResponse(created as LeitoRow);
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'LEITO_CODIGO_TAKEN',
          message: 'Já existe leito com este código no setor.',
        });
      }
      throw err;
    }
  }
}

@Injectable()
export class UpdateLeitoUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(idRaw: string, dto: UpdateLeitoDto): Promise<LeitoResponse> {
    const id = parseId(idRaw);
    const tx = this.prisma.tx();
    const existing = await tx.leitos.findFirst({
      where: { id, deleted_at: null },
      select: { id: true },
    });
    if (existing === null) throw notFound();

    const data: Prisma.leitosUpdateInput = { updated_at: new Date() };
    if (dto.codigo !== undefined) data.codigo = dto.codigo;
    if (dto.tipoAcomodacao !== undefined) data.tipo_acomodacao = dto.tipoAcomodacao;
    if (dto.extra !== undefined) data.extra = dto.extra;
    if (dto.observacao !== undefined) data.observacao = dto.observacao;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;

    try {
      const updated = await tx.leitos.update({
        where: { id: existing.id },
        data,
      });
      return toResponse(updated as LeitoRow);
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'LEITO_CODIGO_TAKEN',
          message: 'Já existe leito com este código no setor.',
        });
      }
      throw err;
    }
  }
}

@Injectable()
export class ChangeLeitoStatusUseCase {
  private readonly logger = new Logger(ChangeLeitoStatusUseCase.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Troca o status de um leito com:
   *   1. Validação contra `LeitoStatusMachine`.
   *   2. Otimistic lock: `WHERE id=? AND versao=?` com incremento.
   *      Se afetar 0 linhas → 409 stale data.
   *   3. Em sucesso, **emite evento via `EventEmitter2`** consumido
   *      pelo `MapaLeitosService` (Fase 5 Trilha B) que faz o relay
   *      WebSocket para os clientes do mapa de leitos.
   *
   * Fase 5 estenderá com `paciente_id`/`atendimento_id` para alocação
   * real. Aqui só transitamos o estado e (quando saímos de OCUPADO)
   * limpamos paciente/atendimento por consistência com o CHECK do banco.
   */
  async execute(
    idRaw: string,
    dto: ChangeLeitoStatusDto,
  ): Promise<LeitoResponse> {
    const id = parseId(idRaw);
    const tx = this.prisma.tx();
    const current = (await tx.leitos.findFirst({
      where: { id, deleted_at: null },
    })) as LeitoRow | null;
    if (current === null) throw notFound();

    if (!LeitoStatusMachine.canTransition(current.status, dto.novoStatus)) {
      throw new ConflictException({
        code: 'LEITO_TRANSICAO_INVALIDA',
        message: `Transição ${current.status} → ${dto.novoStatus} não permitida.`,
      });
    }

    if (dto.novoStatus === LeitoStatus.OCUPADO) {
      // CHECK ck_leitos_ocupacao exige paciente_id/atendimento_id.
      // Esses só existem em fluxo de alocação (Fase 5). Aqui rejeitamos.
      throw new UnprocessableEntityException({
        code: 'LEITO_OCUPADO_REQ_ALOCACAO',
        message:
          'Status OCUPADO requer alocação completa (paciente + atendimento). Use o fluxo de alocação da Fase 5.',
      });
    }

    // Otimistic lock + incremento de versão. Se status atual saiu de
    // OCUPADO, limpa paciente/atendimento para satisfazer o CHECK.
    const setOccupancyNull = current.status === LeitoStatus.OCUPADO;
    const occupancyClause = setOccupancyNull
      ? Prisma.sql`,
          paciente_id = NULL,
          atendimento_id = NULL,
          ocupacao_iniciada_em = NULL,
          ocupacao_prevista_fim = NULL`
      : Prisma.empty;
    const result: number = await tx.$executeRaw`
      UPDATE leitos
      SET status = ${dto.novoStatus}::enum_leito_status,
          versao = versao + 1,
          updated_at = now()${occupancyClause}
      WHERE id = ${id}
        AND versao = ${dto.versao}
        AND deleted_at IS NULL
    `;

    if (result === 0) {
      throw new ConflictException({
        code: 'LEITO_VERSAO_DESATUALIZADA',
        message:
          'O leito foi modificado por outra operação. Recarregue e tente novamente.',
      });
    }

    const updated = (await tx.leitos.findUnique({
      where: { id },
    })) as LeitoRow | null;
    if (updated === null) {
      // Improvável (acabamos de atualizar), mas mantemos defesa.
      throw notFound();
    }
    // Emite evento WS — best-effort. Falha não pode bloquear a
    // transição administrativa do leito.
    await this.publicarEventoStatus(updated);
    return toResponse(updated);
  }

  private async publicarEventoStatus(row: LeitoRow): Promise<void> {
    try {
      const ctx = RequestContextStorage.get();
      if (ctx === undefined) {
        return;
      }
      // Carrega o nome do setor para enriquecer o payload (necessário
      // para a UI exibir "UTI Geral" sem segunda chamada). Best-effort:
      // se falhar, segue com nome vazio.
      const setor = await this.prisma.tx().setores.findUnique({
        where: { id: row.setor_id },
        select: { nome: true },
      });
      const base = {
        tenantId: ctx.tenantId.toString(),
        leitoId: row.id.toString(),
        leitoCodigo: row.codigo,
        setorId: row.setor_id.toString(),
        setorNome: setor?.nome ?? '',
        versao: row.versao,
        emitidoEm: new Date().toISOString(),
      };
      switch (row.status) {
        case LeitoStatus.HIGIENIZACAO: {
          const payload: LeitoHigienizandoEventPayload = { ...base };
          this.eventEmitter.emit(LEITO_EVENT_NAMES.HIGIENIZANDO, payload);
          break;
        }
        case LeitoStatus.DISPONIVEL: {
          const payload: LeitoDisponivelEventPayload = { ...base };
          this.eventEmitter.emit(LEITO_EVENT_NAMES.DISPONIVEL, payload);
          break;
        }
        case LeitoStatus.MANUTENCAO: {
          const payload: LeitoManutencaoEventPayload = { ...base };
          this.eventEmitter.emit(LEITO_EVENT_NAMES.MANUTENCAO, payload);
          break;
        }
        case LeitoStatus.BLOQUEADO: {
          const payload: LeitoBloqueadoEventPayload = { ...base };
          this.eventEmitter.emit(LEITO_EVENT_NAMES.BLOQUEADO, payload);
          break;
        }
        case LeitoStatus.RESERVADO: {
          const payload: LeitoReservadoEventPayload = { ...base };
          this.eventEmitter.emit(LEITO_EVENT_NAMES.RESERVADO, payload);
          break;
        }
        // OCUPADO via este endpoint é rejeitado em `execute()`.
        case LeitoStatus.OCUPADO:
        default:
          break;
      }
    } catch (err) {
      this.logger.warn(
        {
          leitoId: row.id.toString(),
          err: err instanceof Error ? err.message : String(err),
        },
        'leitos: publicação de evento WS falhou (não-bloqueante)',
      );
    }
  }
}

@Injectable()
export class DeleteLeitoUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(idRaw: string): Promise<void> {
    const id = parseId(idRaw);
    const tx = this.prisma.tx();
    const existing = (await tx.leitos.findFirst({
      where: { id, deleted_at: null },
      select: { id: true, status: true },
    })) as { id: bigint; status: LeitoStatus } | null;
    if (existing === null) throw notFound();
    if (existing.status === LeitoStatus.OCUPADO) {
      throw new ConflictException({
        code: 'LEITO_OCUPADO_NAO_PODE_REMOVER',
        message:
          'Leito ocupado não pode ser removido. Libere a ocupação primeiro.',
      });
    }
    await tx.leitos.update({
      where: { id: existing.id },
      data: { deleted_at: new Date(), ativo: false },
    });
  }
}
