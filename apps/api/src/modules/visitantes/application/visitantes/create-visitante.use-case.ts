/**
 * `POST /v1/visitantes` — cadastra visitante (LGPD).
 *
 * O CPF chega em claro mas é hashado antes de qualquer persistência ou
 * log. Em caso de duplicidade (`uq_visitante_cpf`), devolvemos 409 com
 * o UUID do visitante existente para a UI redirecionar.
 */
import {
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import { hashCpf, normalizeCpf } from '../../domain/cpf-hasher';
import type { CreateVisitanteDto } from '../../dto/create-visitante.dto';
import type { VisitanteResponse } from '../../dto/responses';
import { VisitantesRepository } from '../../infrastructure/visitantes.repository';
import { presentVisitante } from './visitante.presenter';

@Injectable()
export class CreateVisitanteUseCase {
  constructor(
    private readonly repo: VisitantesRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(dto: CreateVisitanteDto): Promise<VisitanteResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('CreateVisitanteUseCase requires request context.');
    }

    if (normalizeCpf(dto.cpf) === null) {
      throw new UnprocessableEntityException({
        code: 'CPF_INVALIDO',
        message: 'CPF inválido — esperado 11 dígitos.',
      });
    }

    const { cpfHash, cpfUltimos4 } = hashCpf(dto.cpf, ctx.tenantId);

    // Pré-check de duplicidade (devolve 409 amigável com UUID existente).
    const existente = await this.repo.findVisitanteByCpfHash(cpfHash);
    if (existente !== null) {
      throw new ConflictException({
        code: 'VISITANTE_DUPLICADO',
        message: 'Já existe visitante com este CPF.',
        visitanteUuid: existente.uuid_externo,
      });
    }

    const inserted = await this.repo.insertVisitante({
      tenantId: ctx.tenantId,
      nome: dto.nome,
      cpfHash,
      cpfUltimos4,
      documentoFotoUrl: dto.documentoFotoUrl ?? null,
      observacao: dto.observacao ?? null,
      userId: ctx.userId,
    });

    await this.auditoria.record({
      tabela: 'visitantes',
      registroId: inserted.id,
      operacao: 'I',
      diff: {
        evento: 'visitante.criado',
        // Não logamos cpfHash nem cpf — apenas últimos 4 dígitos.
        cpf_ultimos4: cpfUltimos4,
        nome_len: dto.nome.length,
      },
      finalidade: 'visitante.criado',
    });

    const row = await this.repo.findVisitanteByUuid(inserted.uuidExterno);
    if (row === null) {
      throw new Error('Visitante criado não encontrado (RLS?).');
    }
    return presentVisitante(row);
  }
}
