/**
 * Presenter — converte rows do Postgres em DTOs do Admin/Tenants.
 */
import type { TenantRow } from '../../infrastructure/admin.repository';
import type { TenantResponse } from '../../dto/responses';

function toIso(d: Date | null): string | null {
  return d === null ? null : d.toISOString();
}

export function presentTenant(row: TenantRow): TenantResponse {
  return {
    uuid: row.uuid_externo,
    codigo: row.codigo,
    cnpj: row.cnpj,
    razaoSocial: row.razao_social,
    nomeFantasia: row.nome_fantasia,
    cnes: row.cnes,
    registroAns: row.registro_ans,
    versaoTissPadrao: row.versao_tiss_padrao,
    ativo: row.ativo,
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at),
    deletedAt: toIso(row.deleted_at),
  };
}
