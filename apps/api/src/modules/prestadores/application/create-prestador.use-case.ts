/**
 * Use case: `POST /v1/prestadores` — cria prestador no tenant atual.
 *
 * Regras (Trilha B / Fase 3):
 *   - Conselho (tipo + UF + número) é validado por algoritmo nominal
 *     (sem checagem oficial CNES — futura fase Integrações).
 *   - CPF opcional: se preenchido, valida algoritmo e armazena APENAS
 *     `cpf_hash` (SHA-256). Não há `cpf_encrypted` no schema atual —
 *     TODO se Compliance pedir cifragem reversível.
 *   - Unique compound (tenant_id, tipo_conselho, numero_conselho,
 *     uf_conselho) protege contra duplicidade real do CFM.
 *   - `created_at` automático; `updated_by`/`created_by` ainda não estão
 *     na tabela (não foram migrados — TODO `004x_audit_who`).
 *   - Auditoria: tg_audit no banco já registra o INSERT.
 */
import {
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../common/context/request-context';
import type { CreatePrestadorDto } from '../dto/create-prestador.dto';
import type { PrestadorResponse } from '../dto/prestador.response';
import {
  presentPrestador,
  type PrestadorWithEspecialidades,
} from './prestador.presenter';
import {
  isValidCpf,
  validateConselho,
} from '../infrastructure/conselho.validator';

const PRESTADOR_INCLUDE = {
  prestadores_especialidades: {
    include: {
      especialidades: { select: { codigo_cbos: true, nome: true } },
    },
  },
} satisfies Prisma.prestadoresInclude;

@Injectable()
export class CreatePrestadorUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(dto: CreatePrestadorDto): Promise<PrestadorResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('CreatePrestadorUseCase requires a request context.');
    }

    // Validação cruzada do conselho (campo a campo — DTO já fez tipo/range).
    const conselhoErrors = validateConselho({
      tipoConselho: dto.tipoConselho,
      numeroConselho: dto.numeroConselho,
      ufConselho: dto.ufConselho,
    });
    if (conselhoErrors.length > 0) {
      throw new UnprocessableEntityException({
        code: 'PRESTADOR_INVALID_CONSELHO',
        message: 'Dados de conselho inválidos.',
        details: conselhoErrors,
      });
    }

    let cpfHash: string | null = null;
    if (dto.cpf !== undefined && dto.cpf.trim().length > 0) {
      if (!isValidCpf(dto.cpf)) {
        throw new UnprocessableEntityException({
          code: 'PRESTADOR_INVALID_CPF',
          message: 'CPF inválido.',
        });
      }
      const cpfDigits = dto.cpf.replace(/\D/g, '');
      cpfHash = createHash('sha256').update(cpfDigits).digest('hex');
    }

    const tx = this.prisma.tx();
    const ufConselho = dto.ufConselho.toUpperCase();

    let row: PrestadorWithEspecialidades;
    try {
      row = (await tx.prestadores.create({
        data: {
          tenant_id: ctx.tenantId,
          nome: dto.nome,
          nome_social: dto.nomeSocial ?? null,
          cpf_hash: cpfHash,
          tipo_conselho:
            dto.tipoConselho as unknown as Prisma.prestadoresCreateInput['tipo_conselho'],
          numero_conselho: dto.numeroConselho,
          uf_conselho: ufConselho,
          rqe: dto.rqe ?? null,
          tipo_vinculo:
            dto.tipoVinculo as unknown as Prisma.prestadoresCreateInput['tipo_vinculo'],
          recebe_repasse: dto.recebeRepasse ?? true,
          repasse_diaria: dto.repasseDiaria ?? false,
          repasse_taxa: dto.repasseTaxa ?? false,
          repasse_servico: dto.repasseServico ?? false,
          repasse_matmed: dto.repasseMatmed ?? false,
          socio_cooperado: dto.socioCooperado ?? false,
          credenciado_direto:
            dto.credenciadoDireto !== undefined
              ? (dto.credenciadoDireto as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          dados_bancarios:
            dto.dadosBancarios !== undefined
              ? (dto.dadosBancarios as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          cbo_principal: dto.cboPrincipal ?? null,
        },
        include: PRESTADOR_INCLUDE,
      })) as unknown as PrestadorWithEspecialidades;
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'PRESTADOR_CONSELHO_TAKEN',
          message:
            'Já existe um prestador com este conselho (tipo + UF + número) no tenant.',
        });
      }
      throw err;
    }

    return presentPrestador(row);
  }
}
