/**
 * `POST /v1/documentos/:uuid/assinar` — assina ICP-Brasil documento
 * clínico previamente emitido.
 *
 * Fluxo:
 *   1. Carrega documento. Se já assinado → 409.
 *   2. Resolve prestador (titular).
 *   3. Chama `IcpBrasilService.assinar({payload: documento serializado})`.
 *   4. UPDATE `documentos_emitidos.assinatura_digital` + `assinado_em`.
 *      Após esse UPDATE, trigger DDL `tg_imutavel_apos_assinatura` (no
 *      banco) bloqueia qualquer alteração subsequente (INVARIANTE #3).
 *   5. (Opcional) Re-renderiza HTML+PDF com selo de assinatura — não é
 *      bloqueante; permanece o PDF anterior se a re-render falhar.
 *   6. Audit `documento.assinado`.
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { AssinarDto } from '../../dto/assinar.dto';
import { IcpBrasilService } from '../../infrastructure/icp-brasil.service';
import { PdfRendererService } from '../../infrastructure/pdf-renderer.service';
import { PepRepository } from '../../infrastructure/pep.repository';
import {
  presentDocumento,
  type DocumentoResponse,
} from './documento.presenter';

@Injectable()
export class AssinarDocumentoUseCase {
  constructor(
    private readonly repo: PepRepository,
    private readonly icp: IcpBrasilService,
    private readonly pdf: PdfRendererService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(uuid: string, dto: AssinarDto): Promise<DocumentoResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('AssinarDocumentoUseCase requires a request context.');
    }

    const doc = await this.repo.findDocumentoByUuid(uuid);
    if (doc === null) {
      throw new NotFoundException({
        code: 'DOCUMENTO_NOT_FOUND',
        message: 'Documento não encontrado.',
      });
    }
    if (doc.assinado_em !== null) {
      throw new ConflictException({
        code: 'DOCUMENTO_JA_ASSINADO',
        message: 'Documento já está assinado (RN-PEP-03).',
      });
    }

    const prestadorId = await this.repo.findPrestadorIdByUser(ctx.userId);
    if (prestadorId === null) {
      throw new UnprocessableEntityException({
        code: 'USUARIO_SEM_PRESTADOR',
        message: 'Usuário não possui cadastro de prestador para assinar.',
      });
    }
    const prestador = await this.repo.findPrestadorBasic(prestadorId);

    const assinatura = await this.icp.assinar({
      payload: {
        documento_uuid: doc.uuid_externo,
        atendimento_id: doc.atendimento_id?.toString() ?? null,
        paciente_id: doc.paciente_id.toString(),
        emissor_id: doc.emissor_id.toString(),
        tipo: doc.tipo,
        conteudo: doc.conteudo,
        data_emissao: doc.data_emissao.toISOString(),
      },
      certPemBase64: dto.certPemBase64,
      p12Base64: dto.p12Base64,
      p12Senha: dto.p12Senha,
      stubTitular: prestador?.nome ?? 'Prestador HMS-BR',
    });

    await this.repo.assinarDocumento(
      doc.id,
      assinatura as unknown as Record<string, unknown>,
    );

    // Re-render com selo (best-effort). Falha silenciosa.
    try {
      const paciente = await this.repo.findPacienteBasic(doc.paciente_id);
      await this.pdf.renderEPersistir(doc.uuid_externo, {
        tipo: doc.tipo,
        pacienteNome: paciente?.nome ?? 'Paciente',
        pacienteNascimento: paciente?.data_nascimento ?? null,
        emissorNome: doc.emissor_nome ?? prestador?.nome ?? 'Emissor',
        emissorRegistro: prestador?.registro_conselho ?? null,
        dataEmissao: doc.data_emissao.toISOString(),
        conteudo: (doc.conteudo as Record<string, unknown> | null) ?? {},
        assinatura: {
          titular: assinatura.certInfo.titular,
          emissor: assinatura.certInfo.emissor,
          timestamp: assinatura.timestamp,
          algoritmo: assinatura.algoritmo,
          hashPrefix: assinatura.hash.slice(0, 16),
          simulado: assinatura.stub === true,
        },
      });
    } catch {
      // PHI-safe: não logamos detalhes — apenas seguimos.
    }

    await this.auditoria.record({
      tabela: 'documentos_emitidos',
      registroId: doc.id,
      operacao: 'U',
      diff: {
        evento: 'documento.assinado',
        algoritmo: assinatura.algoritmo,
        hash_prefix: assinatura.hash.slice(0, 16),
        simulado: assinatura.stub,
      },
      finalidade: 'documento.assinado',
    });

    const updated = await this.repo.findDocumentoByUuid(uuid);
    if (updated === null) {
      throw new Error('Documento assinado não encontrado.');
    }
    return presentDocumento(updated);
  }
}
