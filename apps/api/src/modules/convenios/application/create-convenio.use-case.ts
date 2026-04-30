/**
 * Use case: `POST /v1/convenios` — cria convênio no tenant atual.
 *
 * Regras:
 *   - CNPJ validado por algoritmo (mod 11). Sem dependência externa.
 *   - `versaoTiss` default `'4.01.00'`.
 *   - Constraint unique (tenant_id, cnpj) e (tenant_id, codigo).
 *   - Auditoria via tg_audit no banco.
 */
import {
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../common/context/request-context';
import { isValidCnpj } from '../../prestadores/infrastructure/conselho.validator';
import type { CreateConvenioDto } from '../dto/create-convenio.dto';
import type { ConvenioResponse } from '../dto/convenio.response';
import { presentConvenio, type ConvenioRow } from './convenio.presenter';

function formatCnpj(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length !== 14) {
    return input;
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

@Injectable()
export class CreateConvenioUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(dto: CreateConvenioDto): Promise<ConvenioResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('CreateConvenioUseCase requires a request context.');
    }
    if (!isValidCnpj(dto.cnpj)) {
      throw new UnprocessableEntityException({
        code: 'CONVENIO_INVALID_CNPJ',
        message: 'CNPJ inválido.',
      });
    }

    const tx = this.prisma.tx();
    try {
      const row = (await tx.convenios.create({
        data: {
          tenant_id: ctx.tenantId,
          codigo: dto.codigo.toUpperCase(),
          nome: dto.nome,
          cnpj: formatCnpj(dto.cnpj),
          registro_ans: dto.registroAns ?? null,
          tipo: dto.tipo as unknown as Prisma.conveniosCreateInput['tipo'],
          padrao_tiss: dto.padraoTiss ?? true,
          versao_tiss: dto.versaoTiss ?? '4.01.00',
          url_webservice: dto.urlWebservice ?? null,
          contato:
            dto.contato !== undefined
              ? (dto.contato as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
        },
      })) as unknown as ConvenioRow;
      return presentConvenio(row);
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const target = (err.meta as { target?: string[] | string } | undefined)
          ?.target;
        const targetStr = Array.isArray(target) ? target.join(',') : String(target ?? '');
        const isCnpj = targetStr.includes('cnpj');
        throw new ConflictException({
          code: isCnpj ? 'CONVENIO_CNPJ_TAKEN' : 'CONVENIO_CODIGO_TAKEN',
          message: isCnpj
            ? 'Já existe um convênio com este CNPJ no tenant.'
            : 'Já existe um convênio com este código no tenant.',
        });
      }
      throw err;
    }
  }
}
