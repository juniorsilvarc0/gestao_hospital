/**
 * Use case: `PATCH /v1/prestadores/:uuid` — atualiza dados parciais.
 *
 * Conselho NÃO é alterável (vide DTO). CPF pode ser atualizado (recalcula
 * o hash). Auditoria automática via tg_audit no banco.
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import type { UpdatePrestadorDto } from '../dto/update-prestador.dto';
import type { PrestadorResponse } from '../dto/prestador.response';
import {
  presentPrestador,
  type PrestadorWithEspecialidades,
} from './prestador.presenter';
import { isValidCpf } from '../infrastructure/conselho.validator';

const PRESTADOR_INCLUDE = {
  prestadores_especialidades: {
    include: {
      especialidades: { select: { codigo_cbos: true, nome: true } },
    },
  },
} satisfies Prisma.prestadoresInclude;

@Injectable()
export class UpdatePrestadorUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    uuid: string,
    dto: UpdatePrestadorDto,
  ): Promise<PrestadorResponse> {
    const tx = this.prisma.tx();

    const existing = await tx.prestadores.findFirst({
      where: { uuid_externo: uuid, deleted_at: null },
      select: { id: true },
    });
    if (existing === null) {
      throw new NotFoundException({
        code: 'PRESTADOR_NOT_FOUND',
        message: 'Prestador não encontrado.',
      });
    }

    const data: Prisma.prestadoresUpdateInput = { updated_at: new Date() };
    if (dto.nome !== undefined) data.nome = dto.nome;
    if (dto.nomeSocial !== undefined) data.nome_social = dto.nomeSocial;
    if (dto.rqe !== undefined) data.rqe = dto.rqe;
    if (dto.tipoVinculo !== undefined) {
      data.tipo_vinculo =
        dto.tipoVinculo as unknown as Prisma.prestadoresUpdateInput['tipo_vinculo'];
    }
    if (dto.recebeRepasse !== undefined) data.recebe_repasse = dto.recebeRepasse;
    if (dto.repasseDiaria !== undefined) data.repasse_diaria = dto.repasseDiaria;
    if (dto.repasseTaxa !== undefined) data.repasse_taxa = dto.repasseTaxa;
    if (dto.repasseServico !== undefined) data.repasse_servico = dto.repasseServico;
    if (dto.repasseMatmed !== undefined) data.repasse_matmed = dto.repasseMatmed;
    if (dto.socioCooperado !== undefined) data.socio_cooperado = dto.socioCooperado;
    if (dto.cboPrincipal !== undefined) data.cbo_principal = dto.cboPrincipal;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;
    if (dto.credenciadoDireto !== undefined) {
      data.credenciado_direto = dto.credenciadoDireto as unknown as Prisma.InputJsonValue;
    }
    if (dto.dadosBancarios !== undefined) {
      data.dados_bancarios = dto.dadosBancarios as Prisma.InputJsonValue;
    }
    if (dto.cpf !== undefined) {
      if (dto.cpf.trim().length === 0) {
        data.cpf_hash = null;
      } else {
        if (!isValidCpf(dto.cpf)) {
          throw new UnprocessableEntityException({
            code: 'PRESTADOR_INVALID_CPF',
            message: 'CPF inválido.',
          });
        }
        const cpfDigits = dto.cpf.replace(/\D/g, '');
        data.cpf_hash = createHash('sha256').update(cpfDigits).digest('hex');
      }
    }

    const row = (await tx.prestadores.update({
      where: { id: existing.id },
      data,
      include: PRESTADOR_INCLUDE,
    })) as unknown as PrestadorWithEspecialidades;

    return presentPrestador(row);
  }
}
