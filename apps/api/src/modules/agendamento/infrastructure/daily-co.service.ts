/**
 * `DailyCoService` — stub de provisionamento de salas de teleconsulta.
 *
 * Por que stub?
 *   STACK.md elege Daily.co como provedor de teleconsulta (fallback
 *   Jitsi self-hosted). A criação real de room exige API key (DAILY_API_KEY),
 *   billing ativo e contrato de DPA — nada disso está disponível em dev.
 *   Até a Fase 11 (Portais + Integrações) este service devolve URL e
 *   nonce determinísticos pela aplicação, válidos por uma janela de
 *   tempo, suficientes para Trilha C/portal-paciente exibirem o botão
 *   "Entrar na consulta" em ambiente de homologação.
 *
 * Em produção:
 *   - Substituir `criarSala` por POST https://api.daily.co/v1/rooms
 *     com payload:
 *       privacy: 'private',
 *       properties: {
 *         exp: Math.floor(input.fim.getTime()/1000) + 30*60,  // RN-AGE-05
 *         max_participants: 2,
 *         eject_at_room_exp: true,
 *         enable_chat: true,
 *         enable_recording: 'cloud-beta', // se contratado
 *       }
 *   - Persistir `daily_room_name` separado do `link_teleconsulta` para
 *     viabilizar revogação/extensão.
 *   - Emitir `meeting-token` por usuário (paciente vs médico) com
 *     `is_owner=true` apenas para o profissional (RN-PEP-07).
 *
 * Nonce:
 *   32 caracteres hex (16 bytes aleatórios). Usado como segredo
 *   compartilhado entre o agendamento e o portal — quem não souber o
 *   nonce não consegue exigir o link de uma URL pública.
 *
 * Janela de validade (RN-AGE-05):
 *   `expiraEm = fim + 30min`. O endpoint de validação compara contra
 *   `inicio - 30min` no piso, então um link nunca abre antes de 30min
 *   pré-início.
 */
import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

const NONCE_BYTES = 16;
const POS_FIM_GRACE_MIN = 30;

export interface CriarSalaInput {
  agendamentoUuid: string;
  inicio: Date;
  fim: Date;
}

export interface SalaTeleconsulta {
  url: string;
  nonce: string;
  expiraEm: Date;
}

@Injectable()
export class DailyCoService {
  private readonly logger = new Logger(DailyCoService.name);

  /**
   * Gera URL de sala + nonce. Não chama API externa.
   */
  async criarSala(input: CriarSalaInput): Promise<SalaTeleconsulta> {
    const nonce = randomBytes(NONCE_BYTES).toString('hex');
    const url = `https://daily.co/hms-${nonce}`;
    const expiraEm = new Date(
      input.fim.getTime() + POS_FIM_GRACE_MIN * 60 * 1000,
    );

    this.logger.log(
      {
        agendamentoUuid: input.agendamentoUuid,
        expiraEm: expiraEm.toISOString(),
      },
      'agendamento.teleconsulta.sala_criada (stub)',
    );

    return Promise.resolve({ url, nonce, expiraEm });
  }
}
