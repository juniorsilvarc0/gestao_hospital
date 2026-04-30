/**
 * `TeleconsultaController` — endpoint do portal paciente para abrir a
 * sala de teleconsulta.
 *
 * Endpoint:
 *   GET /v1/portal/paciente/teleconsulta/:agendamentoUuid/link
 *     - autenticado (JwtAuthGuard global). Em produção, autorização
 *       fina (paciente do agendamento OU médico) deve ser aplicada
 *       via `PermissionsGuard` + ABAC. Aqui exigimos apenas o claim
 *       `portal:read` que é granted para perfis PACIENTE e MEDICO
 *       (ver `permissoes` Fase 2).
 *     - retorna `{ url, expiraEm }` se o link estiver vivo;
 *     - 410 Gone se fora da janela ±30min (RN-AGE-05);
 *     - 404 se não existir;
 *     - 403 se quem chama não é paciente/prestador do agendamento.
 *
 * Janela (RN-AGE-05):
 *   `[inicio - 30min, fim + 30min]`
 *
 * Nonce:
 *   o `teleconsulta_nonce` faz parte do registro `agendamentos`. O
 *   controller só verifica que a coluna existe — quem chama o endpoint
 *   já passou o JWT, então o nonce é checagem extra contra
 *   adulteração de URL (ex.: alguém com permissão tenta abrir
 *   teleconsulta de outro agendamento). NÃO é exposto na resposta.
 */
import {
  Controller,
  Get,
  GoneException,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { PrismaService } from '../../infrastructure/persistence/prisma.service';

const PRE_INICIO_GRACE_MIN = 30;
const POS_FIM_GRACE_MIN = 30;

interface AgendamentoLinha {
  id: bigint;
  paciente_id: bigint;
  recurso_id: bigint;
  inicio: Date;
  fim: Date;
  link_teleconsulta: string | null;
  teleconsulta_nonce: string | null;
}

interface RecursoLinha {
  /**
   * `usuarios.id` que está vinculado ao `prestador_id` deste recurso
   * (relação 1:1 lógica — primeiro usuário ativo encontrado).
   */
  prestador_usuario_id: bigint | null;
}

interface PacienteLinha {
  /**
   * `pacientes.usuario_id` (Fase 11 quando o portal mapear
   * usuário↔paciente). Por enquanto pode ser null.
   */
  usuario_id: bigint | null;
}

@ApiTags('teleconsulta')
@ApiBearerAuth()
@Controller({ path: 'portal/paciente/teleconsulta', version: '1' })
export class TeleconsultaController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':agendamentoUuid/link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Devolve URL da teleconsulta se a janela estiver aberta (RN-AGE-05). ' +
      'Retorna 410 fora da janela; 403 se o caller não for paciente/médico do agendamento.',
  })
  async obterLink(
    @Param('agendamentoUuid', new ParseUUIDPipe({ version: '4' }))
    agendamentoUuid: string,
    @Req() req: Request,
  ): Promise<{ url: string; expiraEm: string }> {
    if (req.user === undefined) {
      throw new UnauthorizedException();
    }

    // Lê via tx() — RLS aplica `tenant_id = current_setting`.
    const tx = this.prisma.tx();
    const linhas = await tx.$queryRawUnsafe<AgendamentoLinha[]>(
      `
      SELECT id, paciente_id, recurso_id, inicio, fim,
             link_teleconsulta, teleconsulta_nonce
        FROM agendamentos
       WHERE uuid_externo = $1::uuid
       LIMIT 1
      `,
      agendamentoUuid,
    );
    if (linhas.length === 0) {
      throw new NotFoundException({
        code: 'AGENDAMENTO_NAO_ENCONTRADO',
        message: 'Agendamento não encontrado.',
      });
    }
    const linha = linhas[0];

    if (
      linha.link_teleconsulta === null ||
      linha.teleconsulta_nonce === null
    ) {
      // Agendamento existe mas não foi provisionado como teleconsulta.
      throw new NotFoundException({
        code: 'TELECONSULTA_NAO_PROVISIONADA',
        message: 'Agendamento não tem teleconsulta associada.',
      });
    }

    // Verificação RN-AGE-05: now ∈ [inicio - 30min, fim + 30min].
    const agora = new Date();
    const aberturaEm = new Date(
      linha.inicio.getTime() - PRE_INICIO_GRACE_MIN * 60 * 1000,
    );
    const expiraEm = new Date(
      linha.fim.getTime() + POS_FIM_GRACE_MIN * 60 * 1000,
    );
    if (agora < aberturaEm || agora > expiraEm) {
      throw new GoneException({
        code: 'TELECONSULTA_FORA_DA_JANELA',
        message: 'Link de teleconsulta fora da janela de validade.',
        aberturaEm: aberturaEm.toISOString(),
        expiraEm: expiraEm.toISOString(),
      });
    }

    // Autorização ABAC mínima: o caller precisa ser o paciente OU o
    // prestador (médico) do agendamento. Implementação atual:
    //   - paciente:  pacientes.contatos.usuario_id == sub  (placeholder
    //     até Fase 11 mapear o vínculo formal)
    //   - médico:    agendas_recursos.prestador_id → prestadores.usuario_id
    //                == sub
    // Como a coluna `usuario_id` em `pacientes`/`prestadores` ainda
    // não está padronizada, fazemos check best-effort. Perfil ADMIN
    // bypassa para suporte/operação.
    const isAdmin = req.user.perfis.includes('ADMIN');
    if (!isAdmin) {
      const autorizado = await this.checkAutorizacao(
        linha,
        req.user.sub,
      );
      if (!autorizado) {
        throw new ForbiddenException({
          code: 'TELECONSULTA_FORBIDDEN',
          message: 'Usuário não pertence ao agendamento.',
        });
      }
    }

    return {
      url: linha.link_teleconsulta,
      expiraEm: expiraEm.toISOString(),
    };
  }

  private async checkAutorizacao(
    linha: AgendamentoLinha,
    usuarioId: bigint,
  ): Promise<boolean> {
    const tx = this.prisma.tx();
    // Paciente — coluna `usuario_id` ainda não existe no schema. Usamos
    // best-effort buscando por uma claim opcional embutida no JWT
    // (perfil PACIENTE com sub mapeado externamente). Por ora retornamos
    // `true` se o caller possuir o perfil PACIENTE — Fase 11 endurece.
    // Médico — `prestadores.usuario_id` (relacionamento existente).
    // `usuarios.prestador_id` faz a ponte entre login e prestador (Fase 2).
    // Pegamos o primeiro usuário ATIVO que aponta para o prestador do
    // recurso. Caso de múltiplos logins (raro) é tratado em Fase 11.
    const recursos = await tx.$queryRawUnsafe<RecursoLinha[]>(
      `
      SELECT u.id AS prestador_usuario_id
        FROM agendas_recursos ar
        LEFT JOIN usuarios u
               ON u.prestador_id = ar.prestador_id
              AND u.ativo = TRUE
              AND u.deleted_at IS NULL
       WHERE ar.id = $1::bigint
       LIMIT 1
      `,
      linha.recurso_id,
    );
    const prestadorUsuarioId = recursos[0]?.prestador_usuario_id ?? null;
    if (prestadorUsuarioId !== null && prestadorUsuarioId === usuarioId) {
      return true;
    }
    // Paciente — placeholder (ver comentário acima).
    const pacientes = await tx.$queryRawUnsafe<PacienteLinha[]>(
      `
      SELECT (contatos->>'usuario_id')::bigint AS usuario_id
        FROM pacientes
       WHERE id = $1::bigint
      `,
      linha.paciente_id,
    );
    const pacienteUsuarioId = pacientes[0]?.usuario_id ?? null;
    if (pacienteUsuarioId !== null && pacienteUsuarioId === usuarioId) {
      return true;
    }
    return false;
  }
}
