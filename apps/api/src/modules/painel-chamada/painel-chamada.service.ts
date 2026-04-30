/**
 * `PainelChamadaService` — orquestra o "chamar paciente":
 *
 *   1. Localiza o agendamento pelo uuid (via Prisma com RLS).
 *   2. Resolve o setor a partir do recurso (sala) ou do convênio.
 *   3. Monta o payload mínimo (sem PHI excessivo: somente primeiro
 *      nome + última inicial).
 *   4. Emite via gateway para a room `setor:<uuid>`.
 *   5. Registra `auditoria_eventos` lógico `painel.chamada.emitida`.
 *
 * Por que sem PHI completo?
 *   O painel é uma TV em sala de espera **pública**. Mostrar nome
 *   inteiro infringe LGPD (RN-LGP-01). Padrão TOTVS é
 *   `Maria S.` ou `Senha 042 — Sala 3`.
 *
 * Contrato com o gateway:
 *   - O serviço só conhece "emitir para setor X". Não cria room.
 *   - O serviço só fala com o gateway via `emitirChamada(setorUuid, payload)`.
 *
 * Resolução de setor:
 *   Trilha A pode (em fase futura) decidir o setor de chamada por
 *   `recurso → sala → setor`. Para o entregável de Trilha B, o setor
 *   vem como parâmetro **opcional** do request (recepcionista escolhe
 *   o setor para projetar a chamada na TV correta). Se não vier,
 *   tentamos derivar: recurso PRESTADOR → primeiro setor do prestador;
 *   recurso SALA → setor da sala.
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../common/context/request-context';
import {
  PainelChamadaGateway,
  type PacienteChamadoEvent,
} from './painel-chamada.gateway';

interface AgendamentoLinha {
  id: bigint;
  paciente_nome: string;
  recurso_id: bigint;
  inicio: Date;
  fim: Date;
}

interface ResolverSetorResult {
  setorUuid: string;
  salaCodigo: string | null;
}

export interface ChamarPacienteInput {
  agendamentoUuid: string;
  /** Setor onde a TV está plugada — sobrescreve a derivação automática. */
  setorUuid?: string;
  /** Sala/consultório como string para apresentação na TV. */
  sala?: string;
}

@Injectable()
export class PainelChamadaService {
  private readonly logger = new Logger(PainelChamadaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: PainelChamadaGateway,
  ) {}

  async chamar(input: ChamarPacienteInput): Promise<{ setorUuid: string }> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new ForbiddenException({
        code: 'NO_CONTEXT',
        message: 'Endpoint exige contexto autenticado.',
      });
    }
    const tx = this.prisma.tx();

    const linhas = await tx.$queryRawUnsafe<AgendamentoLinha[]>(
      `
      SELECT a.id, p.nome AS paciente_nome,
             a.recurso_id, a.inicio, a.fim
        FROM agendamentos a
        JOIN pacientes p ON p.id = a.paciente_id
       WHERE a.uuid_externo = $1::uuid
       LIMIT 1
      `,
      input.agendamentoUuid,
    );
    const ag = linhas[0];
    if (ag === undefined) {
      throw new NotFoundException({
        code: 'AGENDAMENTO_NAO_ENCONTRADO',
        message: 'Agendamento não encontrado.',
      });
    }

    const setor = await this.resolverSetor(input, ag.recurso_id);
    const payload: PacienteChamadoEvent = {
      pacienteNome: this.minimizarNome(ag.paciente_nome),
      senha: this.formatarSenha(ag.id),
      sala: input.sala ?? setor.salaCodigo ?? '—',
      hora: ag.inicio.toISOString(),
    };

    this.gateway.emitirChamada(setor.setorUuid, payload);

    await this.gravarAuditoria(ag.id, setor.setorUuid);
    this.logger.log(
      {
        agendamentoId: ag.id.toString(),
        setorUuid: setor.setorUuid,
      },
      'painel.chamada.emitida',
    );

    return { setorUuid: setor.setorUuid };
  }

  private async resolverSetor(
    input: ChamarPacienteInput,
    recursoId: bigint,
  ): Promise<ResolverSetorResult> {
    const tx = this.prisma.tx();
    if (input.setorUuid !== undefined && input.setorUuid.length > 0) {
      const linhas = await tx.$queryRawUnsafe<{ uuid_externo: string }[]>(
        `SELECT uuid_externo FROM setores WHERE uuid_externo = $1::uuid LIMIT 1`,
        input.setorUuid,
      );
      if (linhas.length === 0) {
        throw new BadRequestException({
          code: 'SETOR_NAO_ENCONTRADO',
          message: 'Setor informado não existe no tenant.',
        });
      }
      return { setorUuid: linhas[0].uuid_externo, salaCodigo: null };
    }

    // Derivação: recurso → sala_id → setor.
    const linhas = await tx.$queryRawUnsafe<
      {
        setor_uuid: string | null;
        sala_codigo: string | null;
      }[]
    >(
      `
      SELECT s.uuid_externo AS setor_uuid,
             sc.codigo      AS sala_codigo
        FROM agendas_recursos ar
        LEFT JOIN salas_cirurgicas sc ON sc.id = ar.sala_id
        LEFT JOIN setores s ON s.id = sc.setor_id
       WHERE ar.id = $1::bigint
       LIMIT 1
      `,
      recursoId,
    );
    const row = linhas[0];
    if (row === undefined || row.setor_uuid === null) {
      throw new BadRequestException({
        code: 'SETOR_NAO_DERIVAVEL',
        message:
          'Não foi possível derivar o setor a partir do recurso. ' +
          'Informe `setorUuid` explicitamente.',
      });
    }
    return { setorUuid: row.setor_uuid, salaCodigo: row.sala_codigo };
  }

  /** Mantém apenas o primeiro nome + inicial do último sobrenome. */
  private minimizarNome(nome: string): string {
    const partes = nome.trim().split(/\s+/);
    if (partes.length === 0) {
      return '';
    }
    if (partes.length === 1) {
      return partes[0];
    }
    const ultimo = partes[partes.length - 1];
    return `${partes[0]} ${ultimo.charAt(0)}.`;
  }

  /** "Senha" estável a partir do id (3 dígitos) — para a TV mostrar. */
  private formatarSenha(agendamentoId: bigint): string {
    const tail = Number(agendamentoId % 1000n);
    return tail.toString().padStart(3, '0');
  }

  private async gravarAuditoria(
    agendamentoId: bigint,
    setorUuid: string,
  ): Promise<void> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      return;
    }
    const tx = this.prisma.tx();
    try {
      await tx.$executeRaw`
        INSERT INTO auditoria_eventos
          (tenant_id, tabela, registro_id, operacao, diff,
           usuario_id, finalidade, correlation_id)
        VALUES
          (${ctx.tenantId}::bigint,
           'agendamentos',
           ${agendamentoId}::bigint,
           'S',
           ${JSON.stringify({ evento: 'painel.chamada.emitida', setorUuid })}::jsonb,
           ${ctx.userId}::bigint,
           'painel.chamada.emitida',
           ${ctx.correlationId}::uuid)
      `;
    } catch (err) {
      this.logger.warn(
        {
          agendamentoId: agendamentoId.toString(),
          err: err instanceof Error ? err.message : String(err),
        },
        'painel-chamada: falha gravando auditoria — engolida',
      );
    }
  }
}
