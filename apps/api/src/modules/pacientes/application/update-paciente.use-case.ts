/**
 * Use case: `PATCH /v1/pacientes/{uuid}` — atualização parcial.
 *
 * Aplica apenas os campos presentes no DTO. Se `cpf` ou `cns` chegam,
 * revalida algoritmo e regrava `cpf_encrypted` / `cpf_hash`.
 *
 * Optimistic-lock via `versao`: a coluna é incrementada a cada UPDATE.
 * (A Trilha D que faz o frontend deve enviar `If-Match` no header com
 * a versão; aqui não fazemos enforcement — RN-CON-01 será adicionada
 * após Fase 5.)
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
import type { UpdatePacienteDto } from '../dto/update-paciente.dto';
import type { PacienteResponse } from '../dto/paciente.response';
import { CpfValidator } from '../infrastructure/cpf.validator';
import { CnsValidator } from '../infrastructure/cns.validator';
import { CpfCryptoService } from '../infrastructure/cpf-crypto.service';
import { PacientesRepository } from '../infrastructure/pacientes.repository';
import { presentPaciente } from './paciente.presenter';

@Injectable()
export class UpdatePacienteUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cpfCrypto: CpfCryptoService,
    private readonly repo: PacientesRepository,
  ) {}

  async execute(
    uuid: string,
    dto: UpdatePacienteDto,
  ): Promise<PacienteResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('UpdatePacienteUseCase requires a request context.');
    }
    const tx = this.prisma.tx();

    const existingId = await this.repo.findIdByUuid(uuid);
    if (existingId === null) {
      throw new NotFoundException({
        code: 'PACIENTE_NOT_FOUND',
        message: 'Paciente não encontrado.',
      });
    }

    // Sets esparsos: vamos compor um array de "coluna = valor" via SQL
    // fragments só com o que veio. Sem fallback para Prisma porque
    // `cpf_encrypted` é BYTEA cifrado por pgp_sym_encrypt.
    const sets: Prisma.Sql[] = [];

    if (dto.nome !== undefined) {
      sets.push(Prisma.sql`nome = ${dto.nome}`);
    }
    if (dto.nomeSocial !== undefined) {
      sets.push(Prisma.sql`nome_social = ${dto.nomeSocial}`);
    }
    if (dto.cpf !== undefined) {
      if (dto.cpf.length === 0) {
        sets.push(Prisma.sql`cpf_encrypted = NULL`);
        sets.push(Prisma.sql`cpf_hash = NULL`);
      } else {
        if (!CpfValidator.isValid(dto.cpf)) {
          throw new UnprocessableEntityException({
            code: 'PACIENTE_INVALID_CPF',
            message: 'CPF inválido.',
          });
        }
        const hash = this.cpfCrypto.hashCpf(dto.cpf);
        const encrypted = await this.cpfCrypto.encryptCpf(dto.cpf, tx);
        sets.push(Prisma.sql`cpf_hash = ${hash}`);
        sets.push(Prisma.sql`cpf_encrypted = ${encrypted}`);
      }
    }
    if (dto.rg !== undefined) {
      sets.push(Prisma.sql`rg = ${dto.rg}`);
    }
    if (dto.cns !== undefined) {
      if (dto.cns.length === 0) {
        sets.push(Prisma.sql`cns = NULL`);
      } else {
        if (!CnsValidator.isValid(dto.cns)) {
          throw new UnprocessableEntityException({
            code: 'PACIENTE_INVALID_CNS',
            message: 'CNS inválido.',
          });
        }
        sets.push(
          Prisma.sql`cns = ${CnsValidator.normalize(dto.cns) ?? dto.cns}`,
        );
      }
    }
    if (dto.dataNascimento !== undefined) {
      sets.push(Prisma.sql`data_nascimento = ${dto.dataNascimento}::date`);
    }
    if (dto.sexo !== undefined) {
      sets.push(Prisma.sql`sexo = ${dto.sexo}::enum_paciente_sexo`);
    }
    if (dto.tipoSanguineo !== undefined) {
      sets.push(Prisma.sql`tipo_sanguineo = ${dto.tipoSanguineo}`);
    }
    if (dto.nomeMae !== undefined) {
      sets.push(Prisma.sql`nome_mae = ${dto.nomeMae}`);
    }
    if (dto.nomePai !== undefined) {
      sets.push(Prisma.sql`nome_pai = ${dto.nomePai}`);
    }
    if (dto.estadoCivil !== undefined) {
      sets.push(Prisma.sql`estado_civil = ${dto.estadoCivil}`);
    }
    if (dto.profissao !== undefined) {
      sets.push(Prisma.sql`profissao = ${dto.profissao}`);
    }
    if (dto.racaCor !== undefined) {
      sets.push(Prisma.sql`raca_cor = ${dto.racaCor}`);
    }
    if (dto.nacionalidade !== undefined) {
      sets.push(Prisma.sql`nacionalidade = ${dto.nacionalidade}`);
    }
    if (dto.naturalidadeUf !== undefined) {
      sets.push(Prisma.sql`naturalidade_uf = ${dto.naturalidadeUf}`);
    }
    if (dto.naturalidadeCidade !== undefined) {
      sets.push(Prisma.sql`naturalidade_cidade = ${dto.naturalidadeCidade}`);
    }
    if (dto.endereco !== undefined) {
      sets.push(Prisma.sql`endereco = ${JSON.stringify(dto.endereco)}::jsonb`);
    }
    if (dto.contatos !== undefined) {
      sets.push(Prisma.sql`contatos = ${JSON.stringify(dto.contatos)}::jsonb`);
    }
    if (dto.alergias !== undefined) {
      sets.push(Prisma.sql`alergias = ${JSON.stringify(dto.alergias)}::jsonb`);
    }
    if (dto.comorbidades !== undefined) {
      sets.push(
        Prisma.sql`comorbidades = ${JSON.stringify(dto.comorbidades)}::jsonb`,
      );
    }
    if (dto.tipoAtendimentoPadrao !== undefined) {
      sets.push(
        Prisma.sql`tipo_atendimento_padrao = ${dto.tipoAtendimentoPadrao}::enum_paciente_tipo_atendimento_padrao`,
      );
    }
    if (dto.consentimentoLgpd !== undefined) {
      sets.push(Prisma.sql`consentimento_lgpd = ${dto.consentimentoLgpd}`);
      if (dto.consentimentoLgpd === true) {
        sets.push(Prisma.sql`consentimento_lgpd_em = now()`);
      } else {
        sets.push(Prisma.sql`consentimento_lgpd_em = NULL`);
      }
    }
    if (dto.camposComplementares !== undefined) {
      sets.push(
        Prisma.sql`campos_complementares = ${JSON.stringify(dto.camposComplementares)}::jsonb`,
      );
    }

    if (sets.length === 0) {
      // Nada para atualizar — devolve estado atual (200 OK).
      const current = await this.repo.findByUuid(uuid);
      if (current === null) {
        throw new NotFoundException({ code: 'PACIENTE_NOT_FOUND' });
      }
      return presentPaciente(current);
    }

    sets.push(Prisma.sql`updated_at = now()`);
    sets.push(Prisma.sql`updated_by = ${ctx.userId}::bigint`);
    sets.push(Prisma.sql`versao = versao + 1`);

    try {
      await tx.$executeRaw(
        Prisma.sql`UPDATE pacientes SET ${Prisma.join(sets, ', ')} WHERE id = ${existingId}::bigint AND deleted_at IS NULL`,
      );
    } catch (err: unknown) {
      throw this.translateUniqueViolation(err);
    }

    const updated = await this.repo.findByUuid(uuid);
    if (updated === null) {
      throw new NotFoundException({ code: 'PACIENTE_NOT_FOUND' });
    }
    return presentPaciente(updated);
  }

  private translateUniqueViolation(err: unknown): unknown {
    if (err instanceof Error) {
      const message = err.message;
      if (message.includes('uq_pacientes_cpf_tenant')) {
        return new ConflictException({
          code: 'PACIENTE_CPF_TAKEN',
          message: 'Já existe paciente com este CPF no tenant.',
        });
      }
      if (message.includes('uq_pacientes_cns_tenant')) {
        return new ConflictException({
          code: 'PACIENTE_CNS_TAKEN',
          message: 'Já existe paciente com este CNS no tenant.',
        });
      }
    }
    return err;
  }
}
