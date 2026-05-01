/**
 * `VerificarElegibilidadeUseCase` — adapta input UUID-baseado da
 * fronteira HTTP para os IDs internos esperados pelo
 * `ConvenioElegibilidadeService`.
 *
 * Regras (RN-ATE-02):
 *   - Recepção pode chamar **antes** de abrir o atendimento — útil
 *     para confirmar elegibilidade e só então criar o registro.
 *   - Falha de webservice **não** rejeita o request: devolvemos
 *     `fonte: 'MANUAL'` e o operador segue.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../common/context/request-context';
import {
  ConvenioElegibilidadeService,
  type ElegibilidadeFonte,
  type ElegibilidadeResult,
} from '../infrastructure/elegibilidade.service';

export interface VerificarElegibilidadeInput {
  pacienteUuid: string;
  convenioUuid: string;
  numeroCarteirinha: string;
  procedimentoUuid?: string;
}

export interface VerificarElegibilidadeOutput {
  elegivel: boolean;
  fonte: ElegibilidadeFonte;
  detalhes?: string;
  consultadoEm: string;
  expiraEm: string;
}

@Injectable()
export class VerificarElegibilidadeUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly elegibilidade: ConvenioElegibilidadeService,
  ) {}

  async execute(
    input: VerificarElegibilidadeInput,
  ): Promise<VerificarElegibilidadeOutput> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new NotFoundException({
        code: 'NO_CONTEXT',
        message: 'Endpoint exige contexto autenticado.',
      });
    }
    const tx = this.prisma.tx();

    const paciente = await tx.pacientes.findFirst({
      where: { uuid_externo: input.pacienteUuid, deleted_at: null },
      select: { id: true },
    });
    if (paciente === null) {
      throw new NotFoundException({
        code: 'PACIENTE_NOT_FOUND',
        message: 'Paciente não encontrado.',
      });
    }

    const convenio = await tx.convenios.findFirst({
      where: { uuid_externo: input.convenioUuid, deleted_at: null },
      select: { id: true },
    });
    if (convenio === null) {
      throw new NotFoundException({
        code: 'CONVENIO_NOT_FOUND',
        message: 'Convênio não encontrado.',
      });
    }

    let procedimentoId: bigint | null = null;
    if (
      input.procedimentoUuid !== undefined &&
      input.procedimentoUuid.length > 0
    ) {
      const proc = await tx.tabelas_procedimentos.findFirst({
        where: { uuid_externo: input.procedimentoUuid },
        select: { id: true },
      });
      if (proc === null) {
        throw new NotFoundException({
          code: 'PROCEDIMENTO_NOT_FOUND',
          message: 'Procedimento não encontrado.',
        });
      }
      procedimentoId = proc.id;
    }

    const resultado: ElegibilidadeResult = await this.elegibilidade.verificar({
      tenantId: ctx.tenantId,
      pacienteId: paciente.id,
      convenioId: convenio.id,
      numeroCarteirinha: input.numeroCarteirinha,
      procedimentoId,
    });

    return {
      elegivel: resultado.elegivel,
      fonte: resultado.fonte,
      detalhes: resultado.detalhes,
      consultadoEm: resultado.consultadoEm.toISOString(),
      expiraEm: resultado.expiraEm.toISOString(),
    };
  }
}
