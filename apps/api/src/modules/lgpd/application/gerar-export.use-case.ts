/**
 * Use case: `POST /v1/lgpd/exports/{uuid}/gerar`.
 *
 * Pré-condição: status = APROVADO (i.e., DPO + Supervisor já aprovaram).
 *
 * Pipeline:
 *   1. Marca status=GERANDO (UPDATE condicional).
 *   2. Monta o Bundle FHIR via `FhirSerializer`.
 *   3. Calcula SHA-256 e "salva em memória" (`memory://lgpd-exports/<uuid>`).
 *      Phase 13+ trocará por upload S3/MinIO + signed URL.
 *   4. Marca status=PRONTO_PARA_DOWNLOAD com hash + URL + data_expiracao
 *      (default: now + 7 dias — `defaultDataExpiracao`).
 *
 * O conteúdo gerado fica em memória (Map estático no use case) só por
 * enquanto — o `BaixarExportUseCase` lê dali quando o cliente fizer
 * `GET /v1/lgpd/exportacao/{uuid}`. O hash persistido prova que o
 * arquivo não mudou entre geração e download.
 */
import { createHash } from 'node:crypto';

import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { AuditoriaService } from '../../auditoria/application/auditoria.service';
import { defaultDataExpiracao, transition } from '../domain/export';
import type { ExportResponse } from '../dto/responses';
import { FhirSerializer } from '../infrastructure/fhir-serializer';
import { LgpdRepository } from '../infrastructure/lgpd.repository';
import { presentExport } from './export.presenter';

/**
 * Storage in-memory dos bundles gerados. Chave: uuid_externo do export.
 * Valor: payload JSON serializado (string) — o BaixarExportUseCase
 * devolve direto na response.
 *
 * Phase 13+ substituir por S3/MinIO. Implementação como Map static
 * sobrevive ao request, mas não a um restart — aceitável enquanto
 * dual-approval + auditoria já protegem contra perdas relevantes.
 */
const inMemoryStore = new Map<string, string>();

export const LgpdExportInMemoryStore = {
  get(uuid: string): string | undefined {
    return inMemoryStore.get(uuid);
  },
  set(uuid: string, payload: string): void {
    inMemoryStore.set(uuid, payload);
  },
  has(uuid: string): boolean {
    return inMemoryStore.has(uuid);
  },
  // Test-only.
  __clear(): void {
    inMemoryStore.clear();
  },
};

@Injectable()
export class GerarExportUseCase {
  constructor(
    private readonly repo: LgpdRepository,
    private readonly fhir: FhirSerializer,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(uuid: string): Promise<ExportResponse> {
    const current = await this.repo.findExportByUuid(uuid);
    if (current === null) {
      throw new NotFoundException({
        code: 'EXPORT_NOT_FOUND',
        message: 'Export LGPD não encontrado.',
      });
    }

    const t = transition(current.status, 'gerar');
    if (t.next === null) {
      throw new UnprocessableEntityException({
        code: 'TRANSICAO_INVALIDA',
        message:
          t.motivo ??
          `Export precisa estar APROVADO para gerar (atual: ${current.status}).`,
      });
    }

    if (current.paciente_id === null) {
      throw new UnprocessableEntityException({
        code: 'EXPORT_SEM_PACIENTE',
        message:
          'Esta versão suporta apenas exports vinculados a paciente. Export em massa será habilitado em fase futura.',
      });
    }

    // 1. Marca como GERANDO — UPDATE condicional protege de race.
    const startedAffected = await this.repo.updateExportGerando(current.id);
    if (startedAffected === 0) {
      throw new UnprocessableEntityException({
        code: 'STATUS_ALTERADO_CONCORRENTEMENTE',
        message: 'Outro processo já iniciou a geração deste export.',
      });
    }

    // 2. Monta bundle FHIR.
    const bundle = await this.fhir.buildBundleForPaciente(current.paciente_id);
    if (bundle === null) {
      throw new NotFoundException({
        code: 'PACIENTE_NOT_FOUND',
        message: 'Paciente associado ao export não foi encontrado.',
      });
    }

    // 3. Serializa + hash + storage in-memory.
    const payload = JSON.stringify(bundle);
    const hash = createHash('sha256').update(payload).digest('hex');
    LgpdExportInMemoryStore.set(current.uuid_externo, payload);

    const arquivoUrl = `memory://lgpd-exports/${current.uuid_externo}`;
    const dataExpiracao = defaultDataExpiracao();

    // 4. Marca como PRONTO_PARA_DOWNLOAD.
    const prontoAffected = await this.repo.updateExportPronto(
      current.id,
      arquivoUrl,
      hash,
      dataExpiracao,
    );
    if (prontoAffected === 0) {
      // Race rara — alguém moveu o status entre GERANDO e o UPDATE final.
      throw new UnprocessableEntityException({
        code: 'STATUS_ALTERADO_CONCORRENTEMENTE',
        message: 'O export saiu do estado GERANDO antes da conclusão.',
      });
    }

    await this.auditoria.record({
      tabela: 'lgpd_exports',
      registroId: current.id,
      operacao: 'U',
      diff: {
        antes: { status: 'APROVADO' },
        depois: {
          status: 'PRONTO_PARA_DOWNLOAD',
          arquivoUrl,
          hashSha256: hash,
          dataExpiracao: dataExpiracao.toISOString(),
        },
      },
      finalidade: 'lgpd.export.gerado',
    });

    const updated = await this.repo.findExportByUuid(uuid);
    if (updated === null) {
      throw new NotFoundException({ code: 'EXPORT_NOT_FOUND' });
    }
    return presentExport(updated);
  }
}
