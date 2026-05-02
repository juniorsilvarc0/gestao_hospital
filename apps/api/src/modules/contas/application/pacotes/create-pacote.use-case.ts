/**
 * `POST /v1/pacotes` — cria pacote de cobrança (RN-FAT-05).
 *
 * Resolve UUIDs (procedimento principal, convênio, itens) via repo,
 * insere cabeçalho + itens, e retorna o pacote completo.
 */
import {
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { CreatePacoteDto } from '../../dto/create-pacote.dto';
import type { PacoteResponse } from '../../dto/responses';
import { PacotesRepository } from '../../infrastructure/pacotes.repository';
import { ContasRepository } from '../../infrastructure/contas.repository';
import { presentPacote } from './pacote.presenter';

@Injectable()
export class CreatePacoteUseCase {
  constructor(
    private readonly repo: PacotesRepository,
    private readonly contasRepo: ContasRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(dto: CreatePacoteDto): Promise<PacoteResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('CreatePacoteUseCase requires request context.');
    }

    let procedimentoPrincipalId: bigint | null = null;
    if (dto.procedimentoPrincipalUuid !== undefined) {
      const proc = await this.contasRepo.findProcedimentoByUuid(
        dto.procedimentoPrincipalUuid,
      );
      if (proc === null) {
        throw new UnprocessableEntityException({
          code: 'PROCEDIMENTO_PRINCIPAL_INVALIDO',
          message: 'Procedimento principal não encontrado.',
        });
      }
      procedimentoPrincipalId = proc.id;
    }

    let convenioId: bigint | null = null;
    if (dto.convenioUuid !== undefined) {
      convenioId = await this.repo.findConvenioIdByUuid(dto.convenioUuid);
      if (convenioId === null) {
        throw new UnprocessableEntityException({
          code: 'CONVENIO_INVALIDO',
          message: 'Convênio não encontrado.',
        });
      }
    }

    // Resolver UUIDs dos itens em batch.
    const procUuids = dto.itens.map((i) => i.procedimentoUuid);
    const procMap = await this.repo.findProcedimentosByUuids(procUuids);
    const naoEncontrados = procUuids.filter((u) => !procMap.has(u));
    if (naoEncontrados.length > 0) {
      throw new UnprocessableEntityException({
        code: 'PROCEDIMENTO_ITEM_INVALIDO',
        message: `Procedimentos não encontrados: ${naoEncontrados.join(', ')}.`,
      });
    }

    const inserted = await this.repo.insertPacote({
      tenantId: ctx.tenantId,
      codigo: dto.codigo,
      nome: dto.nome,
      descricao: dto.descricao ?? null,
      procedimentoPrincipalId,
      convenioId,
      valorTotal: dto.valorTotal.toFixed(4),
      vigenciaInicio: dto.vigenciaInicio,
      vigenciaFim: dto.vigenciaFim ?? null,
      ativo: dto.ativo ?? true,
      userId: ctx.userId,
    });

    for (const it of dto.itens) {
      const proc = procMap.get(it.procedimentoUuid);
      if (proc === undefined) continue;
      await this.repo.insertPacoteItem({
        tenantId: ctx.tenantId,
        pacoteId: inserted.id,
        procedimentoId: proc.id,
        quantidade: it.quantidade.toString(),
        faixaInicio: it.faixaInicio ?? null,
        faixaFim: it.faixaFim ?? null,
      });
    }

    await this.auditoria.record({
      tabela: 'pacotes',
      registroId: inserted.id,
      operacao: 'I',
      diff: {
        evento: 'pacote.criado',
        codigo: dto.codigo,
        valor_total: dto.valorTotal.toFixed(4),
        total_itens: dto.itens.length,
      },
      finalidade: 'pacote.criado',
    });

    const row = await this.repo.findPacoteByUuid(inserted.uuidExterno);
    if (row === null) {
      throw new Error('Pacote criado não encontrado (RLS?).');
    }
    const itens = await this.repo.findItensByPacoteId(row.id);
    return presentPacote(row, itens);
  }
}
