/**
 * `POST /v1/cirurgias/{uuid}/encerrar` — EM_ANDAMENTO → CONCLUIDA
 * (RN-CC-04, RN-CC-06, RN-CC-08).
 *
 * Validações prévias (retornam 422 estruturado em vez de cair no
 * `RAISE EXCEPTION` da trigger DB):
 *   - ficha_cirurgica preenchida
 *   - ficha_anestesica preenchida
 *   - data_hora_inicio preenchida
 *
 * Após encerrar (RN-CC-06), gera itens em `contas_itens`:
 *   1. Procedimento principal — `grupo_gasto = PROCEDIMENTO`,
 *      `prestador_executante_id = cirurgiao_id`.
 *   2. Cada procedimento secundário (do JSONB `procedimentos_secundarios`):
 *      `grupo_gasto` derivado do procedimento, idem prestador.
 *   3. Cada item do gabarito (cadernos_gabaritos_itens):
 *      `grupo_gasto` = grupo do procedimento (MATERIAL/MEDICAMENTO/OPME).
 *   4. Cada OPME utilizado (JSONB `opme_utilizada`):
 *      `grupo_gasto = OPME`, com `lote/registro_anvisa/fabricante`.
 *   5. Cada membro da equipe (`cirurgias_equipe`):
 *      `grupo_gasto = HONORARIO`, `prestador_executante_id` = membro.
 *      Atualiza `cirurgias_equipe.conta_item_id` (RN-CC-08).
 *
 * `valor_unitario = 0` em todos (Fase 8 calcula). `data_realizacao =
 * cirurgia.data_hora_fim`. `setor_id` = setor_id da sala (se houver).
 *
 * `cirurgias.conta_id` é populado se ainda nulo.
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import { nextCirurgiaStatus } from '../../domain/cirurgia';
import type { EncerrarCirurgiaDto } from '../../dto/encerrar-cirurgia.dto';
import type { CirurgiaResponse } from '../../dto/responses';
import { CentroCirurgicoRepository } from '../../infrastructure/centro-cirurgico.repository';
import {
  presentCirurgia,
  unpackOpme,
  unpackProcSecundarios,
} from './cirurgia.presenter';

const GRUPOS_VALIDOS_GABARITO = new Set([
  'MATERIAL',
  'MEDICAMENTO',
  'OPME',
  'GAS',
  'TAXA',
  'SERVICO',
]);

interface ContadoresGeracao {
  procedimentoPrincipal: number;
  procedimentosSecundarios: number;
  gabaritoItens: number;
  opmeItens: number;
  honorariosEquipe: number;
}

@Injectable()
export class EncerrarCirurgiaUseCase {
  constructor(
    private readonly repo: CentroCirurgicoRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(
    uuid: string,
    dto: EncerrarCirurgiaDto,
  ): Promise<CirurgiaResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('EncerrarCirurgiaUseCase requires a request context.');
    }

    if (Number.isNaN(Date.parse(dto.dataHoraFim))) {
      throw new UnprocessableEntityException({
        code: 'CIRURGIA_DATAHORA_FIM_INVALIDA',
        message: 'dataHoraFim inválida.',
      });
    }

    const cir = await this.repo.findCirurgiaByUuid(uuid);
    if (cir === null) {
      throw new NotFoundException({
        code: 'CIRURGIA_NOT_FOUND',
        message: 'Cirurgia não encontrada.',
      });
    }
    const novo = nextCirurgiaStatus(cir.status, 'encerrar');
    if (novo === null) {
      throw new ConflictException({
        code: 'CIRURGIA_STATUS_INVALIDO',
        message: `Cirurgia em status ${cir.status} não pode ser encerrada.`,
      });
    }

    // RN-CC-04 — pré-requisitos.
    const faltantes: string[] = [];
    if (
      cir.ficha_cirurgica === null ||
      cir.ficha_cirurgica === undefined ||
      typeof cir.ficha_cirurgica !== 'object'
    ) {
      faltantes.push('ficha_cirurgica');
    }
    if (
      cir.ficha_anestesica === null ||
      cir.ficha_anestesica === undefined ||
      typeof cir.ficha_anestesica !== 'object'
    ) {
      faltantes.push('ficha_anestesica');
    }
    if (cir.data_hora_inicio === null) {
      faltantes.push('data_hora_inicio');
    }
    if (faltantes.length > 0) {
      throw new UnprocessableEntityException({
        code: 'CIRURGIA_ENCERRAMENTO_INCOMPLETO',
        message:
          'Cirurgia não pode ser encerrada — campos obrigatórios ausentes (RN-CC-04).',
        detalhes: { faltantes },
      });
    }
    const inicio = cir.data_hora_inicio as Date;
    const fim = new Date(dto.dataHoraFim);
    if (fim.getTime() <= inicio.getTime()) {
      throw new UnprocessableEntityException({
        code: 'CIRURGIA_INTERVALO_INVALIDO',
        message: 'dataHoraFim deve ser posterior a data_hora_inicio.',
      });
    }

    // Atualiza fim + intercorrências + status.
    await this.repo.updateCirurgiaEncerramento({
      cirurgiaId: cir.id,
      dataHoraFim: dto.dataHoraFim,
      intercorrencias: dto.intercorrencias ?? null,
    });

    // Geração de contas_itens (RN-CC-06).
    const contadores: ContadoresGeracao = {
      procedimentoPrincipal: 0,
      procedimentosSecundarios: 0,
      gabaritoItens: 0,
      opmeItens: 0,
      honorariosEquipe: 0,
    };

    const contaId = cir.conta_id;
    let setorId: bigint | null = cir.setor_id;
    if (setorId === null) {
      // Fallback: setor do atendimento.
      const atend = await this.repo.findAtendimentoBasics(cir.atendimento_uuid);
      setorId = atend?.setorId ?? null;
    }

    if (contaId === null) {
      // Sem conta aberta: não emitimos itens, apenas anotamos no audit.
      // A UI deve abrir a conta e disparar uma reapuração na Fase 8.
      await this.auditoria.record({
        tabela: 'cirurgias',
        registroId: cir.id,
        operacao: 'U',
        diff: {
          evento: 'cirurgia.encerrada.sem_conta',
          aviso:
            'Conta do atendimento não está aberta — itens NÃO foram emitidos.',
        },
        finalidade: 'cirurgia.encerrada',
      });
    } else {
      // 1. Procedimento principal.
      await this.repo.insertContaItem({
        tenantId: ctx.tenantId,
        contaId,
        procedimentoId: cir.procedimento_principal_id,
        grupoGasto: 'PROCEDIMENTO',
        origem: 'CIRURGIA',
        origemReferenciaId: cir.id,
        origemReferenciaTipo: 'cirurgia',
        quantidade: '1',
        setorId,
        prestadorExecutanteId: cir.cirurgiao_id,
        dataRealizacao: dto.dataHoraFim,
        lote: null,
        fabricante: null,
        registroAnvisa: null,
        userId: ctx.userId,
      });
      contadores.procedimentoPrincipal = 1;

      // 2. Procedimentos secundários (JSONB).
      const procSec = unpackProcSecundarios(cir.procedimentos_secundarios);
      const secUuids = procSec.items.map((it) => it.procedimentoUuid);
      const procsMap = await this.repo.findProcedimentosByUuids(secUuids);
      for (const it of procSec.items) {
        const proc = procsMap.get(it.procedimentoUuid);
        if (proc === undefined) continue;
        await this.repo.insertContaItem({
          tenantId: ctx.tenantId,
          contaId,
          procedimentoId: proc.id,
          grupoGasto: this.normalizaGrupo(proc.grupoGasto),
          origem: 'CIRURGIA',
          origemReferenciaId: cir.id,
          origemReferenciaTipo: 'cirurgia',
          quantidade: String(it.quantidade),
          setorId,
          prestadorExecutanteId: cir.cirurgiao_id,
          dataRealizacao: dto.dataHoraFim,
          lote: null,
          fabricante: null,
          registroAnvisa: null,
          userId: ctx.userId,
        });
        contadores.procedimentosSecundarios += 1;
      }

      // 3. Gabarito.
      if (cir.caderno_gabarito_id !== null) {
        const gabaritoItens = await this.repo.findGabaritoItensByCadernoId(
          cir.caderno_gabarito_id,
        );
        for (const gi of gabaritoItens) {
          const grupo = GRUPOS_VALIDOS_GABARITO.has(gi.procedimento_grupo_gasto)
            ? gi.procedimento_grupo_gasto
            : 'MATERIAL';
          await this.repo.insertContaItem({
            tenantId: ctx.tenantId,
            contaId,
            procedimentoId: gi.procedimento_id,
            grupoGasto: grupo,
            origem: 'CIRURGIA',
            origemReferenciaId: cir.id,
            origemReferenciaTipo: 'cirurgia.gabarito',
            quantidade: gi.quantidade_padrao,
            setorId,
            prestadorExecutanteId: null,
            dataRealizacao: dto.dataHoraFim,
            lote: null,
            fabricante: null,
            registroAnvisa: null,
            userId: ctx.userId,
          });
          contadores.gabaritoItens += 1;
        }
      }

      // 4. OPME utilizado.
      const opmeUtil = unpackOpme(cir.opme_utilizada);
      for (const op of opmeUtil) {
        let opmeProcId: bigint | null = null;
        if (
          op.procedimentoUuid !== null &&
          op.procedimentoUuid !== undefined
        ) {
          const map = await this.repo.findProcedimentosByUuids([
            op.procedimentoUuid,
          ]);
          opmeProcId = map.get(op.procedimentoUuid)?.id ?? null;
        }
        if (opmeProcId === null) {
          // Sem procedimento mapeado, não conseguimos emitir conta_item
          // (FK obrigatória). Audit registra para visibilidade.
          await this.auditoria.record({
            tabela: 'cirurgias',
            registroId: cir.id,
            operacao: 'U',
            diff: {
              evento: 'cirurgia.opme.sem_procedimento',
              descricao: op.descricao,
              quantidade: op.quantidade,
            },
            finalidade: 'cirurgia.encerrada',
          });
          continue;
        }
        await this.repo.insertContaItem({
          tenantId: ctx.tenantId,
          contaId,
          procedimentoId: opmeProcId,
          grupoGasto: 'OPME',
          origem: 'CIRURGIA',
          origemReferenciaId: cir.id,
          origemReferenciaTipo: 'cirurgia.opme',
          quantidade: String(op.quantidade),
          setorId,
          prestadorExecutanteId: cir.cirurgiao_id,
          dataRealizacao: dto.dataHoraFim,
          lote: op.lote ?? null,
          fabricante: op.fabricante ?? null,
          registroAnvisa: op.registroAnvisa ?? null,
          userId: ctx.userId,
        });
        contadores.opmeItens += 1;
      }

      // 5. Honorários da equipe (RN-CC-08).
      const equipe = await this.repo.findEquipeByCirurgiaId(cir.id);
      for (const m of equipe) {
        const inserted = await this.repo.insertContaItem({
          tenantId: ctx.tenantId,
          contaId,
          procedimentoId: cir.procedimento_principal_id,
          grupoGasto: 'HONORARIO',
          origem: 'CIRURGIA',
          origemReferenciaId: cir.id,
          origemReferenciaTipo: 'cirurgia.equipe',
          quantidade: '1',
          setorId,
          prestadorExecutanteId: m.prestador_id,
          dataRealizacao: dto.dataHoraFim,
          lote: null,
          fabricante: null,
          registroAnvisa: null,
          userId: ctx.userId,
        });
        await this.repo.setEquipeContaItem({
          equipeId: m.id,
          contaItemId: inserted.id,
        });
        contadores.honorariosEquipe += 1;
      }

      // Vincula a conta à cirurgia (se ainda não estava).
      await this.repo.setCirurgiaContaId(cir.id, contaId);
    }

    await this.auditoria.record({
      tabela: 'cirurgias',
      registroId: cir.id,
      operacao: 'U',
      diff: {
        evento: 'cirurgia.encerrada',
        status_anterior: cir.status,
        status_novo: 'CONCLUIDA',
        ...contadores,
      },
      finalidade: 'cirurgia.encerrada',
    });

    const updated = await this.repo.findCirurgiaByUuid(uuid);
    if (updated === null) {
      throw new Error('Cirurgia encerrada não encontrada (RLS?).');
    }
    const equipeFinal = await this.repo.findEquipeByCirurgiaId(cir.id);
    const presented = presentCirurgia(updated, equipeFinal);

    this.events.emit('cirurgia.encerrada', {
      tenantId: ctx.tenantId.toString(),
      cirurgia: presented,
    });

    return presented;
  }

  private normalizaGrupo(grupo: string): string {
    if (grupo === 'PROCEDIMENTO') return 'PROCEDIMENTO';
    if (GRUPOS_VALIDOS_GABARITO.has(grupo)) return grupo;
    if (grupo === 'DIARIA') return 'DIARIA';
    if (grupo === 'PACOTE') return 'PACOTE';
    return 'PROCEDIMENTO';
  }
}
