/**
 * Use case: `GET /v1/lgpd/exportacao/{paciente_uuid}`.
 *
 * Exporta dados pessoais do paciente em estrutura **FHIR-like**
 * simplificada (não é R4 completo — geração full-FHIR fica para
 * Fase 11 quando for integrar com portal). O objetivo aqui é atender
 * o direito de portabilidade (Art. 18 V LGPD) com formato JSON
 * estruturado e auditável.
 *
 * **Inclui**:
 *   - Identificação do paciente (CPF decifrado — endpoint exige
 *     permissão extra `lgpd:export`).
 *   - Endereço, contatos, alergias, comorbidades.
 *   - Lista de convênios ativos.
 *   - Histórico de acessos ao prontuário (últimos 100).
 *
 * **Registra acesso** em `acessos_prontuario` com finalidade
 * `lgpd.export` automaticamente (RN-LGP-01). Diferente de
 * `GET /pacientes/:uuid`, aqui a finalidade é fixa — não vem de header.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../common/context/request-context';
import { PacientesRepository } from '../../pacientes/infrastructure/pacientes.repository';
import { CpfCryptoService } from '../../pacientes/infrastructure/cpf-crypto.service';
import { presentVinculo } from '../../pacientes/application/paciente.presenter';

export interface ExportarPacienteContext {
  perfil: string;
  ip: string | null;
}

interface AcessoExport {
  finalidade: string;
  modulo: string;
  perfil: string;
  acessadoEm: string;
}

interface PacienteExport {
  resourceType: 'Patient';
  uuid: string;
  identificadores: {
    codigo: string;
    cpf: string | null;
    cns: string | null;
    rg: string | null;
  };
  dadosPessoais: {
    nome: string;
    nomeSocial: string | null;
    sexo: string;
    dataNascimento: string;
    nomeMae: string;
    nomePai: string | null;
    estadoCivil: string | null;
    racaCor: string | null;
    nacionalidade: string | null;
    naturalidade: { uf: string | null; cidade: string | null };
  };
  endereco: Record<string, unknown>;
  contatos: Record<string, unknown>;
  saude: {
    tipoSanguineo: string | null;
    alergias: unknown[];
    comorbidades: unknown[];
    obito: boolean;
    dataObito: string | null;
  };
  consentimento: {
    aceito: boolean;
    aceitoEm: string | null;
  };
  convenios: ReturnType<typeof presentVinculo>[];
  acessos: AcessoExport[];
  exportadoEm: string;
}

@Injectable()
export class ExportarPacienteUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: PacientesRepository,
    private readonly cpfCrypto: CpfCryptoService,
  ) {}

  async execute(
    pacienteUuid: string,
    accessCtx: ExportarPacienteContext,
  ): Promise<PacienteExport> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('ExportarPacienteUseCase requires a request context.');
    }
    const tx = this.prisma.tx();

    const row = await this.repo.findByUuid(pacienteUuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'PACIENTE_NOT_FOUND',
        message: 'Paciente não encontrado.',
      });
    }

    const pacienteId = await this.repo.findIdByUuid(pacienteUuid);
    if (pacienteId === null) {
      throw new NotFoundException({ code: 'PACIENTE_NOT_FOUND' });
    }

    // Busca o cpf_encrypted (BYTEA) — repository.findByUuid devolve só
    // o hash. Pegamos do banco numa query dedicada para evitar carregar
    // o blob em todas as listagens.
    const encRows = await tx.$queryRaw<{ cpf_encrypted: Buffer | null }[]>`
      SELECT cpf_encrypted FROM pacientes WHERE id = ${pacienteId}::bigint LIMIT 1
    `;
    const cpfClaro =
      encRows.length === 0
        ? undefined
        : await this.cpfCrypto.decryptCpf(encRows[0].cpf_encrypted, tx);

    const vinculos = await this.repo.listVinculos(pacienteId);

    const acessos = await tx.$queryRaw<
      {
        finalidade: string;
        modulo: string;
        perfil: string;
        acessado_em: Date;
      }[]
    >`
      SELECT finalidade, modulo, perfil, acessado_em
        FROM acessos_prontuario
       WHERE paciente_id = ${pacienteId}::bigint
       ORDER BY acessado_em DESC
       LIMIT 100
    `;

    // Registra o próprio acesso (export = leitura PHI, RN-LGP-01).
    await tx.$executeRaw`
      INSERT INTO acessos_prontuario
        (tenant_id, paciente_id, usuario_id, perfil, finalidade, modulo, ip)
      VALUES
        (${ctx.tenantId}::bigint,
         ${pacienteId}::bigint,
         ${ctx.userId}::bigint,
         ${accessCtx.perfil},
         'lgpd.export',
         'LGPD',
         ${accessCtx.ip}::inet)
    `;

    return {
      resourceType: 'Patient',
      uuid: row.uuid_externo,
      identificadores: {
        codigo: row.codigo,
        cpf: cpfClaro ?? null,
        cns: row.cns,
        rg: row.rg,
      },
      dadosPessoais: {
        nome: row.nome,
        nomeSocial: row.nome_social,
        sexo: row.sexo,
        dataNascimento: row.data_nascimento.toISOString().slice(0, 10),
        nomeMae: row.nome_mae,
        nomePai: row.nome_pai,
        estadoCivil: row.estado_civil,
        racaCor: row.raca_cor,
        nacionalidade: row.nacionalidade,
        naturalidade: {
          uf: row.naturalidade_uf,
          cidade: row.naturalidade_cidade,
        },
      },
      endereco:
        row.endereco !== null && typeof row.endereco === 'object'
          ? (row.endereco as Record<string, unknown>)
          : {},
      contatos:
        row.contatos !== null && typeof row.contatos === 'object'
          ? (row.contatos as Record<string, unknown>)
          : {},
      saude: {
        tipoSanguineo: row.tipo_sanguineo,
        alergias: Array.isArray(row.alergias) ? row.alergias : [],
        comorbidades: Array.isArray(row.comorbidades) ? row.comorbidades : [],
        obito: row.obito,
        dataObito:
          row.data_obito === null
            ? null
            : row.data_obito.toISOString().slice(0, 10),
      },
      consentimento: {
        aceito: row.consentimento_lgpd,
        aceitoEm:
          row.consentimento_lgpd_em === null
            ? null
            : row.consentimento_lgpd_em.toISOString(),
      },
      convenios: vinculos.map((v) => presentVinculo(v)),
      acessos: acessos.map((a) => ({
        finalidade: a.finalidade,
        modulo: a.modulo,
        perfil: a.perfil,
        acessadoEm: a.acessado_em.toISOString(),
      })),
      exportadoEm: new Date().toISOString(),
    };
  }
}
