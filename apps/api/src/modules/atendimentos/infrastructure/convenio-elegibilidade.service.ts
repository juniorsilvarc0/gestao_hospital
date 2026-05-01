/**
 * `ConvenioElegibilidadeService` — STUB Trilha A.
 *
 * Trilha B substitui pelo service "real" que consulta
 * `convenios.url_webservice_elegibilidade` (timeout 10s) e cacheia o
 * resultado por 1h (RN-ATE-02).
 *
 * Aqui devolve sempre `{ status: 'OK', fonte: 'STUB' }` — flag
 * `MANUAL` indica que precisa override do operador, mas no stub
 * deixamos o caminho feliz: abertura prossegue com observação
 * "elegibilidade-manual" gravada quando o use case decide.
 */
import { Injectable } from '@nestjs/common';

export interface ResultadoElegibilidade {
  /** OK = elegível; PENDENTE = exige confirmação manual. */
  status: 'OK' | 'PENDENTE' | 'NEGADA';
  fonte: 'WS' | 'STUB' | 'MANUAL';
  mensagem?: string;
}

@Injectable()
export class ConvenioElegibilidadeService {
  async verificar(_input: {
    tenantId: bigint;
    pacienteId: bigint;
    convenioId: bigint;
    pacienteConvenioId: bigint | null;
  }): Promise<ResultadoElegibilidade> {
    // Trilha B: consulta WS aqui. Por enquanto, sempre OK.
    return { status: 'OK', fonte: 'STUB' };
  }
}
