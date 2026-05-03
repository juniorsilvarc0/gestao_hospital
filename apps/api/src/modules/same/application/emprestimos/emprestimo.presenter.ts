/**
 * Converte `EmprestimoRow` em `EmprestimoResponse` — derivando os
 * campos `atrasado` / `diasAtraso` a partir de
 * `data_devolucao_prevista`.
 */
import type { EmprestimoResponse } from '../../dto/responses';
import type { EmprestimoRow } from '../../infrastructure/same.repository';

function toIso(d: Date | null): string | null {
  return d === null ? null : d.toISOString();
}

function toIsoDate(d: Date | null): string | null {
  if (d === null) return null;
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function presentEmprestimo(
  row: EmprestimoRow,
  today: Date = new Date(),
): EmprestimoResponse {
  const prazoIso = toIsoDate(row.data_devolucao_prevista) ?? '';
  const prazoUtc =
    prazoIso === ''
      ? null
      : Date.UTC(
          Number(prazoIso.slice(0, 4)),
          Number(prazoIso.slice(5, 7)) - 1,
          Number(prazoIso.slice(8, 10)),
        );
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );

  const ainda_pendente = row.data_devolucao_real === null;
  const atrasado = ainda_pendente && prazoUtc !== null && prazoUtc < todayUtc;
  const diasAtraso =
    atrasado && prazoUtc !== null
      ? Math.round((todayUtc - prazoUtc) / (24 * 60 * 60 * 1000))
      : 0;

  return {
    uuid: row.uuid_externo,
    prontuarioUuid: row.prontuario_uuid,
    numeroPasta: row.numero_pasta,
    pacienteUuid: row.paciente_uuid,
    pacienteNome: row.paciente_nome,
    solicitanteUuid: row.solicitante_uuid,
    solicitanteNome: row.solicitante_nome,
    motivo: row.motivo,
    dataEmprestimo: toIso(row.data_emprestimo) ?? '',
    dataDevolucaoPrevista: prazoIso,
    dataDevolucaoReal: toIso(row.data_devolucao_real),
    status: row.status,
    atrasado,
    diasAtraso,
    observacao: row.observacao,
    createdAt: toIso(row.created_at) ?? '',
  };
}
