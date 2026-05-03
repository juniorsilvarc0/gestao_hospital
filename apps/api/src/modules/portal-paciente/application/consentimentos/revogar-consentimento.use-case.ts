/**
 * `POST /v1/portal/paciente/consentimentos/{uuid}/revogar` — revoga
 * (não deleta) consentimento aceito.
 *
 * Regras:
 *   - O consentimento precisa pertencer ao paciente do contexto.
 *   - Se já está revogado, 409 — revogação é one-way + final.
 *   - `motivo` mínimo 5 caracteres (RN-LGP-01).
 *
 * Auditoria: evento `lgpd.consentimento.revogado`.
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import { PacienteContextResolver } from '../../domain/paciente-context';
import { isValidMotivoRevogacao } from '../../domain/consentimento';
import { PortalPacienteRepository } from '../../infrastructure/portal-paciente.repository';
import type { RevogarConsentimentoDto } from '../../dto/revogar-consentimento.dto';
import type { PortalConsentimentoResponse } from '../../dto/responses';
import { presentConsentimento } from '../presenter';

@Injectable()
export class RevogarConsentimentoUseCase {
  constructor(
    private readonly resolver: PacienteContextResolver,
    private readonly repo: PortalPacienteRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    consentimentoUuid: string,
    dto: RevogarConsentimentoDto,
  ): Promise<PortalConsentimentoResponse> {
    const ctx = await this.resolver.resolve();
    const motivo = dto.motivo.trim();
    if (!isValidMotivoRevogacao(motivo)) {
      throw new ConflictException({
        code: 'CONSENTIMENTO_MOTIVO_INVALIDO',
        message: 'motivo deve ter entre 5 e 500 caracteres.',
      });
    }

    const row = await this.repo.findConsentimentoByUuid(
      ctx.pacienteId,
      consentimentoUuid,
    );
    if (row === null) {
      throw new NotFoundException({
        code: 'CONSENTIMENTO_NAO_ENCONTRADO',
        message: 'Consentimento não encontrado para o paciente.',
      });
    }
    if (row.data_revogacao !== null) {
      throw new ConflictException({
        code: 'CONSENTIMENTO_JA_REVOGADO',
        message: 'Consentimento já foi revogado anteriormente.',
        revogadoEm: row.data_revogacao.toISOString(),
      });
    }

    await this.repo.updateRevogacaoConsentimento({ id: row.id, motivo });

    await this.auditoria.record({
      tabela: 'consentimentos_lgpd',
      registroId: row.id,
      operacao: 'U',
      diff: {
        evento: 'lgpd.consentimento.revogado',
        motivo,
      },
      finalidade: 'lgpd.consentimento.revogado',
    });

    // Re-leitura para devolver estado atualizado.
    const reread = await this.repo.listConsentimentosPaciente(ctx.pacienteId);
    const updated = reread.find((c) => c.uuid_externo === consentimentoUuid);
    if (updated === undefined) {
      // Não deveria ocorrer; o registro acabou de ser atualizado.
      throw new NotFoundException({
        code: 'CONSENTIMENTO_RELEITURA_FALHOU',
        message: 'Falha ao reler consentimento atualizado.',
      });
    }
    return presentConsentimento(updated);
  }
}
