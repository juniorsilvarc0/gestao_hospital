/**
 * Presenters do módulo Centro Cirúrgico — convertem rows do Postgres em
 * DTOs de resposta. Centralizamos a desserialização de JSONB
 * (`procedimentos_secundarios`, `opme_*`) e a normalização de horários.
 */
import type {
  CirurgiaClassificacao,
  CirurgiaStatus,
  CirurgiaTipoAnestesia,
} from '../../domain/cirurgia';
import type { OpmeItem } from '../../domain/opme';
import type {
  CirurgiaResponse,
  EquipeMembroResponse,
  GabaritoItemResponse,
  GabaritoResponse,
  KitItemResponse,
  KitResponse,
  ProcedimentoSecundarioResponse,
} from '../../dto/responses';
import type {
  CirurgiaRow,
  EquipeRow,
  GabaritoItemRow,
  GabaritoRow,
  KitItemRow,
  KitRow,
} from '../../infrastructure/centro-cirurgico.repository';

function toIso(d: Date | null): string | null {
  return d === null ? null : d.toISOString();
}

function unpackProcSecundarios(value: unknown): {
  items: ProcedimentoSecundarioResponse[];
  exigeAutorizacaoConvenio: boolean;
} {
  const empty = { items: [], exigeAutorizacaoConvenio: false };
  if (value === null || value === undefined) return empty;
  if (Array.isArray(value)) {
    return {
      items: value
        .map((it) => parseProcSecItem(it))
        .filter((v): v is ProcedimentoSecundarioResponse => v !== null),
      exigeAutorizacaoConvenio: false,
    };
  }
  if (typeof value === 'object') {
    const obj = value as {
      items?: unknown;
      _meta?: { exigeAutorizacaoConvenio?: unknown };
    };
    const itemsArr = Array.isArray(obj.items)
      ? obj.items
          .map((it) => parseProcSecItem(it))
          .filter((v): v is ProcedimentoSecundarioResponse => v !== null)
      : [];
    const flag =
      obj._meta?.exigeAutorizacaoConvenio === true ||
      obj._meta?.exigeAutorizacaoConvenio === 'true';
    return { items: itemsArr, exigeAutorizacaoConvenio: flag };
  }
  return empty;
}

function parseProcSecItem(
  raw: unknown,
): ProcedimentoSecundarioResponse | null {
  if (raw === null || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const uuid =
    typeof obj.procedimentoUuid === 'string' ? obj.procedimentoUuid : null;
  const qtdRaw = obj.quantidade;
  const qtd =
    typeof qtdRaw === 'number'
      ? qtdRaw
      : typeof qtdRaw === 'string'
        ? Number(qtdRaw)
        : NaN;
  if (uuid === null || Number.isNaN(qtd)) return null;
  return { procedimentoUuid: uuid, quantidade: qtd };
}

function unpackOpme(value: unknown): OpmeItem[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) return [];
  return value
    .map((it) => parseOpmeItem(it))
    .filter((v): v is OpmeItem => v !== null);
}

function parseOpmeItem(raw: unknown): OpmeItem | null {
  if (raw === null || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const descricao = typeof obj.descricao === 'string' ? obj.descricao : null;
  const qtdRaw = obj.quantidade;
  const qtd =
    typeof qtdRaw === 'number'
      ? qtdRaw
      : typeof qtdRaw === 'string'
        ? Number(qtdRaw)
        : NaN;
  if (descricao === null || Number.isNaN(qtd)) return null;
  return {
    procedimentoUuid:
      typeof obj.procedimentoUuid === 'string' ? obj.procedimentoUuid : null,
    descricao,
    quantidade: qtd,
    fabricante:
      typeof obj.fabricante === 'string' ? obj.fabricante : null,
    registroAnvisa:
      typeof obj.registroAnvisa === 'string' ? obj.registroAnvisa : null,
    lote: typeof obj.lote === 'string' ? obj.lote : null,
    motivoUrgencia:
      typeof obj.motivoUrgencia === 'string' ? obj.motivoUrgencia : null,
  };
}

export function presentEquipeMembro(row: EquipeRow): EquipeMembroResponse {
  return {
    prestadorUuid: row.prestador_uuid,
    prestadorNome: row.prestador_nome,
    funcao: row.funcao,
    ordem: row.ordem,
    contaItemUuid: row.conta_item_uuid,
  };
}

export function presentCirurgia(
  row: CirurgiaRow,
  equipe: EquipeRow[],
): CirurgiaResponse {
  const procSec = unpackProcSecundarios(row.procedimentos_secundarios);
  return {
    uuid: row.uuid_externo,
    atendimentoUuid: row.atendimento_uuid,
    pacienteUuid: row.paciente_uuid,
    pacienteNome: row.paciente_nome,
    procedimentoPrincipalUuid: row.procedimento_principal_uuid,
    procedimentoPrincipalNome: row.procedimento_principal_nome,
    procedimentosSecundarios: procSec.items,
    salaUuid: row.sala_uuid,
    salaNome: row.sala_nome,
    setorUuid: row.setor_uuid,
    dataHoraAgendada: row.data_hora_agendada.toISOString(),
    duracaoEstimadaMinutos: row.duracao_estimada_minutos,
    dataHoraInicio: toIso(row.data_hora_inicio),
    dataHoraFim: toIso(row.data_hora_fim),
    cirurgiaoUuid: row.cirurgiao_uuid,
    cirurgiaoNome: row.cirurgiao_nome,
    tipoAnestesia: row.tipo_anestesia as CirurgiaTipoAnestesia | null,
    classificacaoCirurgia:
      row.classificacao_cirurgia as CirurgiaClassificacao,
    exigeAutorizacaoConvenio:
      row.exige_autorizacao_convenio || procSec.exigeAutorizacaoConvenio,
    kitCirurgicoUuid: row.kit_cirurgico_uuid,
    cadernoGabaritoUuid: row.caderno_gabarito_uuid,
    fichaCirurgicaPreenchida:
      row.ficha_cirurgica !== null && row.ficha_cirurgica !== undefined,
    fichaAnestesicaPreenchida:
      row.ficha_anestesica !== null && row.ficha_anestesica !== undefined,
    intercorrencias: row.intercorrencias,
    status: row.status as CirurgiaStatus,
    contaUuid: row.conta_uuid,
    opmeSolicitada: unpackOpme(row.opme_solicitada),
    opmeAutorizada: unpackOpme(row.opme_autorizada),
    opmeUtilizada: unpackOpme(row.opme_utilizada),
    cancelamentoMotivo: row.cancelamento_motivo,
    canceladoEm: toIso(row.cancelado_em),
    equipe: equipe.map(presentEquipeMembro),
  };
}

export function presentKitItem(row: KitItemRow): KitItemResponse {
  return {
    procedimentoUuid: row.procedimento_uuid,
    procedimentoNome: row.procedimento_nome,
    quantidade: row.quantidade,
    obrigatorio: row.obrigatorio,
  };
}

export function presentKit(row: KitRow, itens: KitItemRow[]): KitResponse {
  return {
    uuid: row.uuid_externo,
    codigo: row.codigo,
    nome: row.nome,
    descricao: row.descricao,
    ativo: row.ativo,
    itens: itens.map(presentKitItem),
  };
}

export function presentGabaritoItem(
  row: GabaritoItemRow,
): GabaritoItemResponse {
  return {
    procedimentoUuid: row.procedimento_uuid,
    procedimentoNome: row.procedimento_nome,
    quantidadePadrao: row.quantidade_padrao,
    obrigatorio: row.obrigatorio,
    observacao: row.observacao,
  };
}

export function presentGabarito(
  row: GabaritoRow,
  itens: GabaritoItemRow[],
): GabaritoResponse {
  return {
    uuid: row.uuid_externo,
    procedimentoPrincipalUuid: row.procedimento_principal_uuid,
    procedimentoPrincipalNome: row.procedimento_principal_nome,
    cirurgiaoUuid: row.cirurgiao_uuid,
    cirurgiaoNome: row.cirurgiao_nome,
    versao: row.versao,
    ativo: row.ativo,
    observacao: row.observacao,
    itens: itens.map(presentGabaritoItem),
  };
}

export { unpackOpme, unpackProcSecundarios };
