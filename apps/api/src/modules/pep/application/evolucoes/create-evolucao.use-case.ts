/**
 * `POST /v1/atendimentos/:atendimentoUuid/evolucoes` — cria rascunho.
 *
 * Fluxo:
 *   1. Resolve atendimento + status. RN-PEP-01: atendimento não pode
 *      estar em estado terminal (ALTA/CANCELADO).
 *   2. Resolve prestador a partir do usuário logado (`usuarios.prestador_id`).
 *      Sem prestador vinculado → 422 (não pode evoluir).
 *   3. Sanitiza `conteudo` TipTap (`tiptap-sanitizer.ts`) — remove XSS.
 *   4. Renderiza HTML cache + extrai `texto_livre` para FTS.
 *   5. INSERT evolucoes (assinada_em IS NULL — rascunho).
 *   6. Audit `evolucao.criada`.
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { CreateEvolucaoDto } from '../../dto/create-evolucao.dto';
import { sanitizeTiptap } from '../../infrastructure/tiptap-sanitizer';
import { PepRepository } from '../../infrastructure/pep.repository';
import { presentEvolucao, type EvolucaoResponse } from './evolucao.presenter';

const TERMINAL = new Set(['ALTA', 'CANCELADO', 'NAO_COMPARECEU']);

@Injectable()
export class CreateEvolucaoUseCase {
  constructor(
    private readonly repo: PepRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    atendimentoUuid: string,
    dto: CreateEvolucaoDto,
  ): Promise<EvolucaoResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('CreateEvolucaoUseCase requires a request context.');
    }

    const atend = await this.repo.findAtendimentoBasic(atendimentoUuid);
    if (atend === null) {
      throw new NotFoundException({
        code: 'ATENDIMENTO_NOT_FOUND',
        message: 'Atendimento não encontrado.',
      });
    }
    if (TERMINAL.has(atend.status)) {
      throw new ConflictException({
        code: 'ATENDIMENTO_ESTADO_TERMINAL',
        message: `Não é permitido evoluir em atendimento com status ${atend.status} (RN-PEP-01).`,
      });
    }

    const prestador = await this.repo.findPrestadorIdByUser(ctx.userId);
    if (prestador === null) {
      throw new UnprocessableEntityException({
        code: 'USUARIO_SEM_PRESTADOR',
        message:
          'Usuário não está vinculado a um cadastro de prestador (RN-PEP-01).',
      });
    }

    let sanitized;
    try {
      sanitized = sanitizeTiptap(dto.conteudo);
    } catch (err: unknown) {
      throw new UnprocessableEntityException({
        code: 'EVOLUCAO_CONTEUDO_INVALIDO',
        message:
          err instanceof Error
            ? err.message
            : 'Conteúdo TipTap inválido.',
      });
    }

    const inserted = await this.repo.insertEvolucaoRascunho({
      tenantId: ctx.tenantId,
      atendimentoId: atend.id,
      pacienteId: atend.paciente_id,
      profissionalId: prestador,
      tipoProfissional: dto.tipoProfissional,
      tipo: dto.tipo,
      conteudo: sanitized.doc as unknown as Record<string, unknown>,
      conteudoHtml: sanitized.htmlCache,
      textoLivre: sanitized.textoLivre,
      cids: dto.cids ?? null,
      sinaisVitaisInline: (dto.sinaisVitais as unknown as Record<string, unknown> | undefined) ?? null,
      createdBy: ctx.userId,
    });

    await this.auditoria.record({
      tabela: 'evolucoes',
      registroId: inserted.id,
      operacao: 'I',
      diff: {
        evento: 'evolucao.criada',
        atendimento_id: atend.id.toString(),
        tipo: dto.tipo,
        tipo_profissional: dto.tipoProfissional,
        // PHI-safe: não logamos conteúdo nem texto.
      },
      finalidade: 'evolucao.criada',
    });

    const row = await this.repo.findEvolucaoByUuid(inserted.uuid_externo);
    if (row === null) {
      throw new Error('Evolução criada não encontrada (RLS?).');
    }
    return presentEvolucao(row);
  }
}
