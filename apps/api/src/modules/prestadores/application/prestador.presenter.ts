/**
 * Presenter: Prisma row → response público.
 *
 * Centraliza para evitar vazamento de campos sensíveis (`cpf_hash`,
 * `tenant_id`, `id` BigInt). Sempre invocar este presenter ao retornar
 * prestador para fora da camada de aplicação.
 */
import type {
  CredenciadoDiretoEntry,
  DadosBancarios,
  EspecialidadeVinculada,
  PrestadorResponse,
} from '../dto/prestador.response';

export interface PrestadorWithEspecialidades {
  uuid_externo: string;
  nome: string;
  nome_social: string | null;
  cpf_hash: string | null;
  tipo_conselho: string;
  numero_conselho: string;
  uf_conselho: string;
  rqe: string | null;
  tipo_vinculo: string;
  recebe_repasse: boolean;
  repasse_diaria: boolean;
  repasse_taxa: boolean;
  repasse_servico: boolean;
  repasse_matmed: boolean;
  socio_cooperado: boolean;
  credenciado_direto: unknown;
  dados_bancarios: unknown;
  cbo_principal: string | null;
  ativo: boolean;
  created_at: Date;
  updated_at: Date | null;
  prestadores_especialidades: Array<{
    principal: boolean;
    rqe: string | null;
    especialidades: {
      uuid_externo?: string | null;
      id?: bigint;
      codigo_cbos: string;
      nome: string;
    };
  }>;
}

function safeArray(value: unknown): CredenciadoDiretoEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (entry): entry is CredenciadoDiretoEntry =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as { convenioUuid?: unknown }).convenioUuid === 'string',
  );
}

function safeBank(value: unknown): DadosBancarios | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as DadosBancarios;
}

export function presentPrestador(
  prestador: PrestadorWithEspecialidades,
): PrestadorResponse {
  const especialidades: EspecialidadeVinculada[] =
    prestador.prestadores_especialidades.map((pe) => ({
      // Catálogo de especialidades AINDA não tem uuid_externo no DB;
      // expomos por codigo_cbos como identificador estável (RN-CAD-stub).
      // Quando adicionarmos uuid à tabela `especialidades`, basta trocar
      // aqui sem mexer na API pública.
      uuid: pe.especialidades.uuid_externo ?? pe.especialidades.codigo_cbos,
      codigoCbos: pe.especialidades.codigo_cbos,
      nome: pe.especialidades.nome,
      principal: pe.principal,
      rqe: pe.rqe,
    }));

  return {
    uuid: prestador.uuid_externo,
    nome: prestador.nome,
    nomeSocial: prestador.nome_social,
    temCpf: prestador.cpf_hash !== null && prestador.cpf_hash.length > 0,
    tipoConselho: prestador.tipo_conselho,
    numeroConselho: prestador.numero_conselho,
    ufConselho: prestador.uf_conselho,
    rqe: prestador.rqe,
    tipoVinculo: prestador.tipo_vinculo,
    recebeRepasse: prestador.recebe_repasse,
    repasseDiaria: prestador.repasse_diaria,
    repasseTaxa: prestador.repasse_taxa,
    repasseServico: prestador.repasse_servico,
    repasseMatmed: prestador.repasse_matmed,
    socioCooperado: prestador.socio_cooperado,
    credenciadoDireto: safeArray(prestador.credenciado_direto),
    dadosBancarios: safeBank(prestador.dados_bancarios),
    cboPrincipal: prestador.cbo_principal,
    ativo: prestador.ativo,
    especialidades,
    createdAt: prestador.created_at.toISOString(),
    updatedAt: prestador.updated_at ? prestador.updated_at.toISOString() : null,
  };
}
