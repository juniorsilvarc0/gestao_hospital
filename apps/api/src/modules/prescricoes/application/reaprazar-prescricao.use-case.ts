/**
 * `POST /v1/prescricoes/:uuid/reaprazar` (RN-PRE-04).
 *
 * Reaprazamento = enfermagem ajusta horários de UM item da prescrição.
 * Não cria nova versão, não viola imutabilidade — `prescricoes_itens.
 * horarios` está fora do conjunto de colunas seladas pela trigger
 * (semântica é informação operacional, não conteúdo da prescrição).
 *
 * Restrições:
 *   - Item deve existir e pertencer à prescrição.
 *   - Item deve estar `ATIVO` (suspensos/encerrados não reaprazam).
 *   - Prescrição deve estar `ATIVA` (AGUARDANDO_ANALISE não dispensa
 *     ainda — não tem horário de enfermagem).
 *
 * Auditoria registra horários antigo/novo (formato JSONB) — informação
 * operacional, não PHI.
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../common/context/request-context';
import { AuditoriaService } from '../../auditoria/application/auditoria.service';
import type { ReaprazarDto } from '../dto/reaprazar.dto';
import type { PrescricaoResponse } from '../dto/list-prescricoes.dto';
import { PrescricoesRepository } from '../infrastructure/prescricoes.repository';
import { presentPrescricao } from './prescricao.presenter';

@Injectable()
export class ReaprazarPrescricaoUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: PrescricoesRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(uuid: string, dto: ReaprazarDto): Promise<PrescricaoResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('ReaprazarPrescricaoUseCase requires a request context.');
    }

    const presc = await this.repo.findPrescricaoByUuid(uuid);
    if (presc === null) {
      throw new NotFoundException({
        code: 'PRESCRICAO_NOT_FOUND',
        message: 'Prescrição não encontrada.',
      });
    }
    if (presc.status !== 'ATIVA') {
      throw new ConflictException({
        code: 'PRESCRICAO_STATUS_INVALIDO',
        message: `Reaprazar requer prescrição ATIVA. Status atual: ${presc.status}.`,
      });
    }

    const item = await this.repo.findItemByUuid(dto.itemUuid);
    if (item === null) {
      throw new NotFoundException({
        code: 'PRESCRICAO_ITEM_NOT_FOUND',
        message: 'Item não encontrado.',
      });
    }
    if (item.prescricao_id !== presc.id) {
      throw new ConflictException({
        code: 'PRESCRICAO_ITEM_INCONSISTENTE',
        message: 'Item não pertence à prescrição informada.',
      });
    }
    if (item.status_item !== 'ATIVO') {
      throw new ConflictException({
        code: 'PRESCRICAO_ITEM_NAO_ATIVO',
        message: `Item com status ${item.status_item} não pode ser reaprazado.`,
      });
    }

    const tx = this.prisma.tx();
    const horariosAntigos = item.horarios;
    const horariosNovos = dto.novosHorarios;

    await tx.$executeRaw`
      UPDATE prescricoes_itens
         SET horarios   = ${JSON.stringify(horariosNovos)}::jsonb,
             updated_at = now()
       WHERE id = ${item.id}::bigint
    `;

    await this.auditoria.record({
      tabela: 'prescricoes_itens',
      registroId: item.id,
      operacao: 'U',
      diff: {
        evento: 'prescricao_item.reaprazado',
        prescricao_id: presc.id.toString(),
        item_uuid: dto.itemUuid,
        horarios_antigos: horariosAntigos,
        horarios_novos: horariosNovos,
      },
      finalidade: 'prescricao_item.reaprazado',
    });

    const updated = await this.repo.findPrescricaoByUuid(uuid);
    if (updated === null) {
      throw new Error('Prescrição reaprazada não encontrada.');
    }
    const itens = await this.repo.findItensByPrescricaoId(presc.id);
    return presentPrescricao(updated, itens);
  }
}
