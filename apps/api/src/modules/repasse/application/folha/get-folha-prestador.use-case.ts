/**
 * `GET /v1/repasse/folha/{prestadorUuid}?competencia=AAAA-MM` — folha
 * detalhada de um prestador na competência.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import type { FolhaPrestadorResponse } from '../../dto/responses-lifecycle';
import { RepasseRepository } from '../../infrastructure/repasse.repository';
import { presentRepasse, presentRepasseItem } from '../lifecycle/repasse.presenter';
import {
  presentAgregadoCriterio,
  presentAgregadoFuncao,
} from './folha.presenter';

@Injectable()
export class GetFolhaPrestadorUseCase {
  constructor(private readonly repo: RepasseRepository) {}

  async execute(args: {
    prestadorUuid: string;
    competencia: string;
  }): Promise<FolhaPrestadorResponse> {
    const prestadorId = await this.repo.findPrestadorIdByUuid(
      args.prestadorUuid,
    );
    if (prestadorId === null) {
      throw new NotFoundException({
        code: 'PRESTADOR_NOT_FOUND',
        message: 'Prestador não encontrado.',
      });
    }

    const repasseRow = await this.repo.findRepassePorPrestadorCompetencia(
      prestadorId,
      args.competencia,
    );

    if (repasseRow === null) {
      // Sem repasse na competência ainda: retornamos estrutura vazia.
      return {
        prestador: {
          uuid: args.prestadorUuid,
          nome: '',
          conselhoSigla: null,
          conselhoNumero: null,
        },
        competencia: args.competencia,
        repasse: null,
        itens: [],
        agregadoPorFuncao: [],
        agregadoPorCriterio: [],
      };
    }

    const itens = await this.repo.findRepasseItensByRepasseId(repasseRow.id);
    const aggFuncao = await this.repo.findFolhaAgregadoPorFuncao(
      repasseRow.id,
    );
    const aggCriterio = await this.repo.findFolhaAgregadoPorCriterio(
      repasseRow.id,
    );

    return {
      prestador: {
        uuid: repasseRow.prestador_uuid,
        nome: repasseRow.prestador_nome,
        conselhoSigla: repasseRow.conselho_sigla,
        conselhoNumero: repasseRow.conselho_numero,
      },
      competencia: args.competencia,
      repasse: presentRepasse(repasseRow),
      itens: itens.map(presentRepasseItem),
      agregadoPorFuncao: aggFuncao.map(presentAgregadoFuncao),
      agregadoPorCriterio: aggCriterio.map(presentAgregadoCriterio),
    };
  }
}
