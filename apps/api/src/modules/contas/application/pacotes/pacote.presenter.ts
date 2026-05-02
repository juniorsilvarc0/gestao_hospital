/**
 * Converte rows do Postgres em DTOs de resposta para o CRUD de pacotes.
 */
import type { PacoteResponse } from '../../dto/responses';
import type {
  PacoteItemRow,
  PacoteRow,
} from '../../infrastructure/pacotes.repository';

function toIsoDate(d: Date | null): string | null {
  if (d === null) return null;
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function presentPacote(
  row: PacoteRow,
  itens: PacoteItemRow[],
): PacoteResponse {
  return {
    uuid: row.uuid_externo,
    codigo: row.codigo,
    nome: row.nome,
    descricao: row.descricao,
    procedimentoPrincipalUuid: row.procedimento_principal_uuid,
    procedimentoPrincipalNome: row.procedimento_principal_nome,
    convenioUuid: row.convenio_uuid,
    valorTotal: row.valor_total,
    vigenciaInicio: toIsoDate(row.vigencia_inicio) ?? '',
    vigenciaFim: toIsoDate(row.vigencia_fim),
    ativo: row.ativo,
    itens: itens.map((it) => ({
      procedimentoUuid: it.procedimento_uuid,
      procedimentoNome: it.procedimento_nome,
      quantidade: it.quantidade,
      faixaInicio: it.faixa_inicio,
      faixaFim: it.faixa_fim,
    })),
  };
}
