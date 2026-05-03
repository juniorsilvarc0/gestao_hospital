/**
 * `POST /v1/portal/paciente/consentimentos` — registra aceite/recusa
 * de termo LGPD.
 *
 * Idempotência:
 *   - Existe UNIQUE (`tenant_id`, `paciente_id`, `finalidade`,
 *     `versao_termo`). Se o paciente já decidiu sobre esta versão do
 *     termo, retornamos `409 Conflict` com `code:
 *     CONSENTIMENTO_JA_REGISTRADO` apontando para o registro
 *     existente. Atualizar a decisão exige uma NOVA versao_termo
 *     (decisão imutável — RN-LGP-01).
 *
 * Captura `ip_origem` e `user_agent` da `Request` (controller injeta
 * via parâmetros do use case).
 *
 * Auditoria:
 *   - Evento `lgpd.consentimento.registrado` com payload mínimo
 *     (uuid, finalidade, versao, aceito) — texto NÃO entra no log
 *     porque pode conter PHI.
 */
import { ConflictException, Injectable } from '@nestjs/common';

import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import { PacienteContextResolver } from '../../domain/paciente-context';
import {
  isValidFinalidade,
  isValidTextoApresentado,
  isValidVersaoTermo,
} from '../../domain/consentimento';
import { PortalPacienteRepository } from '../../infrastructure/portal-paciente.repository';
import type { RegistrarConsentimentoDto } from '../../dto/registrar-consentimento.dto';
import type { PortalConsentimentoResponse } from '../../dto/responses';

export interface RegistrarConsentimentoInput {
  dto: RegistrarConsentimentoDto;
  /** Origem da request (header `x-forwarded-for` ou socket). */
  ipOrigem: string | null;
  /** `user-agent` da request. */
  userAgent: string | null;
}

@Injectable()
export class RegistrarConsentimentoUseCase {
  constructor(
    private readonly resolver: PacienteContextResolver,
    private readonly repo: PortalPacienteRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    input: RegistrarConsentimentoInput,
  ): Promise<PortalConsentimentoResponse> {
    const ctx = await this.resolver.resolve();
    const { dto, ipOrigem, userAgent } = input;

    if (!isValidFinalidade(dto.finalidade)) {
      throw new ConflictException({
        code: 'CONSENTIMENTO_FINALIDADE_INVALIDA',
        message: 'Finalidade inválida.',
      });
    }
    if (!isValidVersaoTermo(dto.versaoTermo)) {
      throw new ConflictException({
        code: 'CONSENTIMENTO_VERSAO_INVALIDA',
        message:
          'versaoTermo deve seguir o formato vMAJOR.MINOR[.PATCH] (ex.: v1.2.0).',
      });
    }
    if (!isValidTextoApresentado(dto.textoApresentado)) {
      throw new ConflictException({
        code: 'CONSENTIMENTO_TEXTO_INVALIDO',
        message: 'textoApresentado fora dos limites permitidos (20..32000).',
      });
    }

    const existente = await this.repo.findConsentimentoExistente(
      ctx.pacienteId,
      dto.finalidade,
      dto.versaoTermo,
    );
    if (existente !== null) {
      throw new ConflictException({
        code: 'CONSENTIMENTO_JA_REGISTRADO',
        message:
          'Já existe decisão registrada para esta versão do termo. Para alterar, emita uma nova versão.',
        consentimentoUuid: existente.uuid_externo,
      });
    }

    const inserted = await this.repo.insertConsentimento({
      tenantId: ctx.tenantId,
      pacienteId: ctx.pacienteId,
      finalidade: dto.finalidade,
      versaoTermo: dto.versaoTermo,
      textoApresentado: dto.textoApresentado,
      aceito: dto.aceito,
      ipOrigem,
      userAgent,
      createdBy: ctx.userId,
    });

    await this.auditoria.record({
      tabela: 'consentimentos_lgpd',
      registroId: inserted.id,
      operacao: 'I',
      diff: {
        evento: 'lgpd.consentimento.registrado',
        finalidade: dto.finalidade,
        versao_termo: dto.versaoTermo,
        aceito: dto.aceito,
        // ip e UA são metadados de auditoria — não PHI.
        ip_origem: ipOrigem,
      },
      finalidade: 'lgpd.consentimento.registrado',
    });

    return {
      uuid: inserted.uuid_externo,
      finalidade: dto.finalidade,
      versaoTermo: dto.versaoTermo,
      aceito: dto.aceito,
      dataDecisao: new Date().toISOString(),
      dataRevogacao: null,
      motivoRevogacao: null,
      ativo: dto.aceito === true,
    };
  }
}
