/**
 * Use case: `POST /v1/pacientes` — cria paciente no tenant atual.
 *
 * Regras:
 *   - **CPF/CNS**: obrigatório pelo menos UM dos dois (RN-ATE-01)
 *     EXCETO quando `pacienteMaeUuid` está preenchido (recém-nascido
 *     vinculado à mãe). Quando informado, valida algoritmo (CPF: dois
 *     DV; CNS: soma ponderada DataSUS) e devolve 422 com `code` e
 *     `field` específicos para que a UI exiba erro inline.
 *   - **Endereço/contatos**: o DTO já validou; o use case só persiste.
 *   - **Código interno**: se não vier no DTO, gera `P-<8 dígitos
 *     aleatórios>` — o tenant pode evoluir para sequência custom mais
 *     tarde sem quebrar API.
 *   - **CPF cripto**: `cpf_encrypted` via `pgp_sym_encrypt` + hash
 *     determinístico SHA-256 em `cpf_hash` (DB.md §6.4).
 *   - **Consentimento LGPD**: se vier `consentimentoLgpd: true`, marca
 *     `consentimento_lgpd_em = now()`. Não pode marcar `false` porque
 *     atendimento exige consentimento (RN-LGP-01).
 *   - **Multi-tenant**: `tenant_id` lido do `RequestContext`. Idem
 *     `created_by`.
 *
 * Erros:
 *   - 400  RN-ATE-01 não atendida (sem CPF/CNS/mãe).
 *   - 422  CPF/CNS inválido.
 *   - 409  CPF/CNS/codigo já existem no tenant (conflict P2002 ou
 *          violação de unique no INSERT raw).
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../common/context/request-context';
import type { CreatePacienteDto } from '../dto/create-paciente.dto';
import type { PacienteResponse } from '../dto/paciente.response';
import { CpfValidator } from '../infrastructure/cpf.validator';
import { CnsValidator } from '../infrastructure/cns.validator';
import { CpfCryptoService } from '../infrastructure/cpf-crypto.service';
import { PacientesRepository } from '../infrastructure/pacientes.repository';
import { presentPaciente } from './paciente.presenter';

@Injectable()
export class CreatePacienteUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cpfCrypto: CpfCryptoService,
    private readonly repo: PacientesRepository,
  ) {}

  async execute(dto: CreatePacienteDto): Promise<PacienteResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error(
        'CreatePacienteUseCase requires an active request context.',
      );
    }
    const tx = this.prisma.tx();

    // ── Validação 1: data_nascimento <= hoje ──
    const dataNasc = new Date(`${dto.dataNascimento}T00:00:00Z`);
    if (Number.isNaN(dataNasc.getTime())) {
      throw new BadRequestException({
        code: 'PACIENTE_INVALID_BIRTHDATE',
        message: 'data_nascimento inválida.',
      });
    }
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (dataNasc.getTime() > today.getTime()) {
      throw new BadRequestException({
        code: 'PACIENTE_BIRTHDATE_IN_FUTURE',
        message: 'data_nascimento não pode ser futura.',
      });
    }

    // ── Validação 2: CPF (algoritmo) ──
    let cpfHash: string | null = null;
    let cpfEncrypted: Buffer | null = null;
    if (dto.cpf !== undefined && dto.cpf.length > 0) {
      if (!CpfValidator.isValid(dto.cpf)) {
        throw new UnprocessableEntityException({
          code: 'PACIENTE_INVALID_CPF',
          message: 'CPF inválido (DV ou sequência repetida).',
        });
      }
      cpfHash = this.cpfCrypto.hashCpf(dto.cpf);
      cpfEncrypted = await this.cpfCrypto.encryptCpf(dto.cpf, tx);
    }

    // ── Validação 3: CNS (algoritmo Luhn-DataSUS) ──
    let cnsNormalized: string | null = null;
    if (dto.cns !== undefined && dto.cns.length > 0) {
      if (!CnsValidator.isValid(dto.cns)) {
        throw new UnprocessableEntityException({
          code: 'PACIENTE_INVALID_CNS',
          message: 'CNS inválido.',
        });
      }
      cnsNormalized = CnsValidator.normalize(dto.cns) ?? null;
    }

    // ── Validação 4: RN-ATE-01 (CPF OR CNS OR mãe) ──
    let pacienteMaeId: bigint | null = null;
    if (dto.pacienteMaeUuid !== undefined) {
      pacienteMaeId = await this.repo.findIdByUuid(dto.pacienteMaeUuid);
      if (pacienteMaeId === null) {
        throw new NotFoundException({
          code: 'PACIENTE_MAE_NOT_FOUND',
          message: 'paciente_mae_uuid não encontrado.',
        });
      }
    }
    if (cpfHash === null && cnsNormalized === null && pacienteMaeId === null) {
      throw new BadRequestException({
        code: 'PACIENTE_REQUIRES_CPF_OR_CNS_OR_MOTHER',
        message:
          'Paciente sem CPF/CNS deve estar vinculado à mãe (paciente_mae_uuid). RN-ATE-01.',
      });
    }

    // ── Geração de código interno (se não veio) ──
    const codigo =
      dto.codigo !== undefined && dto.codigo.length > 0
        ? dto.codigo
        : `P-${randomBytes(4).toString('hex').toUpperCase()}`;

    const consentimentoLgpd = dto.consentimentoLgpd === true;
    const consentimentoLgpdEm = consentimentoLgpd ? new Date() : null;

    // INSERT raw — Prisma não compõe `cpf_encrypted` (BYTEA gerado por
    // pgp_sym_encrypt fica fora do tipo gerado). Usar $queryRaw garante
    // cifragem no banco e evita CPF passar pelo cliente em texto.
    let row: { uuid_externo: string }[];
    try {
      row = await tx.$queryRaw<{ uuid_externo: string }[]>`
        INSERT INTO pacientes (
          tenant_id, codigo, nome, nome_social,
          cpf_encrypted, cpf_hash,
          rg, cns, data_nascimento, sexo, tipo_sanguineo,
          nome_mae, nome_pai, estado_civil, profissao, raca_cor,
          nacionalidade, naturalidade_uf, naturalidade_cidade,
          endereco, contatos, alergias, comorbidades,
          tipo_atendimento_padrao, paciente_mae_id,
          consentimento_lgpd, consentimento_lgpd_em,
          campos_complementares, created_by
        ) VALUES (
          ${ctx.tenantId}::bigint,
          ${codigo},
          ${dto.nome},
          ${dto.nomeSocial ?? null},
          ${cpfEncrypted},
          ${cpfHash},
          ${dto.rg ?? null},
          ${cnsNormalized},
          ${dto.dataNascimento}::date,
          ${dto.sexo}::enum_paciente_sexo,
          ${dto.tipoSanguineo ?? null},
          ${dto.nomeMae},
          ${dto.nomePai ?? null},
          ${dto.estadoCivil ?? null},
          ${dto.profissao ?? null},
          ${dto.racaCor ?? null},
          ${dto.nacionalidade ?? null},
          ${dto.naturalidadeUf ?? null},
          ${dto.naturalidadeCidade ?? null},
          ${JSON.stringify(dto.endereco)}::jsonb,
          ${JSON.stringify(dto.contatos)}::jsonb,
          ${dto.alergias === undefined ? null : JSON.stringify(dto.alergias)}::jsonb,
          ${dto.comorbidades === undefined ? null : JSON.stringify(dto.comorbidades)}::jsonb,
          ${dto.tipoAtendimentoPadrao ?? null}::enum_paciente_tipo_atendimento_padrao,
          ${pacienteMaeId}::bigint,
          ${consentimentoLgpd},
          ${consentimentoLgpdEm},
          ${dto.camposComplementares === undefined ? null : JSON.stringify(dto.camposComplementares)}::jsonb,
          ${ctx.userId}::bigint
        )
        RETURNING uuid_externo::text AS uuid_externo
      `;
    } catch (err: unknown) {
      throw this.translateUniqueViolation(err);
    }

    if (row.length === 0) {
      throw new Error('INSERT pacientes did not return uuid_externo');
    }

    const created = await this.repo.findByUuid(row[0].uuid_externo);
    if (created === null) {
      throw new Error('Paciente recém-criado não encontrado (RLS?)');
    }
    return presentPaciente(created);
  }

  /**
   * Mapeia violações de unique-constraint para HTTP 409 com `code`
   * estável. Os nomes de constraint vêm da migração `cadastros_base`.
   */
  private translateUniqueViolation(err: unknown): unknown {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      const target = String((err.meta as { target?: unknown }).target ?? '');
      if (target.includes('cpf_hash')) {
        return new ConflictException({
          code: 'PACIENTE_CPF_TAKEN',
          message: 'Já existe paciente com este CPF no tenant.',
        });
      }
      if (target.includes('cns')) {
        return new ConflictException({
          code: 'PACIENTE_CNS_TAKEN',
          message: 'Já existe paciente com este CNS no tenant.',
        });
      }
      if (target.includes('codigo')) {
        return new ConflictException({
          code: 'PACIENTE_CODIGO_TAKEN',
          message: 'Código de prontuário já existe.',
        });
      }
    }
    // $queryRaw não envelopa em P2002 — vem como erro pg cru. Mensagem
    // tem o nome da constraint (uq_pacientes_cpf_tenant, etc.).
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
      if (message.includes('uq_pacientes_codigo_tenant')) {
        return new ConflictException({
          code: 'PACIENTE_CODIGO_TAKEN',
          message: 'Código de prontuário já existe.',
        });
      }
    }
    return err;
  }
}
