/**
 * Helper compartilhado: resolve UUIDs do payload de export para BIGINT
 * (filtros que o `BiRepository.exportarMv` consome).
 *
 * Filtros UUID inválidos / inexistentes são tratados como "no match" —
 * a query devolve vazio. Não lançamos erro para evitar enumeration de
 * UUIDs de outros tenants.
 */
import { BiRepository } from '../../bi/infrastructure/bi.repository';
import type { ExportFiltrosDto } from '../dto/export.dto';

export interface ResolvedFiltros {
  competenciaInicio?: string;
  competenciaFim?: string;
  competencia?: string;
  dataInicio?: string;
  dataFim?: string;
  convenioId?: bigint | null;
  prestadorId?: bigint | null;
  recursoId?: bigint | null;
  salaId?: bigint | null;
  setorId?: bigint | null;
  status?: string | null;
  /** Se algum UUID de filtro não resolveu, marcamos para devolver vazio. */
  unresolved: boolean;
}

export async function resolveFiltros(
  repo: BiRepository,
  dto: ExportFiltrosDto,
): Promise<ResolvedFiltros> {
  const out: ResolvedFiltros = {
    competenciaInicio: dto.competenciaInicio,
    competenciaFim: dto.competenciaFim,
    competencia: dto.competencia,
    dataInicio: dto.dataInicio,
    dataFim: dto.dataFim,
    status: dto.status ?? null,
    unresolved: false,
  };

  if (dto.convenioUuid !== undefined) {
    const id = await repo.findConvenioIdByUuid(dto.convenioUuid);
    if (id === null) {
      out.unresolved = true;
    } else {
      out.convenioId = id;
    }
  }
  if (dto.prestadorUuid !== undefined) {
    const id = await repo.findPrestadorIdByUuid(dto.prestadorUuid);
    if (id === null) {
      out.unresolved = true;
    } else {
      out.prestadorId = id;
    }
  }
  if (dto.recursoUuid !== undefined) {
    const id = await repo.findRecursoIdByUuid(dto.recursoUuid);
    if (id === null) {
      out.unresolved = true;
    } else {
      out.recursoId = id;
    }
  }
  if (dto.salaUuid !== undefined) {
    const id = await repo.findSalaCirurgicaIdByUuid(dto.salaUuid);
    if (id === null) {
      out.unresolved = true;
    } else {
      out.salaId = id;
    }
  }
  if (dto.setorUuid !== undefined) {
    const id = await repo.findSetorIdByUuid(dto.setorUuid);
    if (id === null) {
      out.unresolved = true;
    } else {
      out.setorId = id;
    }
  }

  return out;
}
