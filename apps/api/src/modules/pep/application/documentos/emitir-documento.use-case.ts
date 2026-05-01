/**
 * `POST /v1/atendimentos/:atendUuid/documentos` — emite documento
 * clínico (atestado, receita, declaração, encaminhamento, resumo de
 * alta, outro).
 *
 * Fluxo:
 *   1. Resolve atendimento (e paciente).
 *   2. Resolve emissor (UUID enviado OU prestador do usuário logado).
 *   3. Valida `conteudo` por `tipo` via Zod (schema específico).
 *   4. INSERT em `documentos_emitidos`.
 *   5. Renderiza HTML+PDF placeholder via `PdfRendererService` e atualiza
 *      `pdf_url` da linha (apenas em rascunho — antes de assinar).
 *   6. Audit `documento.emitido`.
 *
 * Não assina automaticamente. Após emissão, o cliente chama
 * `POST /v1/documentos/:uuid/assinar` para selar com ICP-Brasil.
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { z } from 'zod';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { EmitirDocumentoDto } from '../../dto/emitir-documento.dto';
import { PdfRendererService } from '../../infrastructure/pdf-renderer.service';
import { PepRepository } from '../../infrastructure/pep.repository';
import {
  presentDocumento,
  type DocumentoResponse,
} from './documento.presenter';

const TERMINAL = new Set(['CANCELADO', 'NAO_COMPARECEU']);

// Schemas Zod por tipo (validação fina do `conteudo`).
const atestadoSchema = z.object({
  diagnosticoCid: z.string().min(1).max(20),
  diasAfastamento: z.number().int().min(0).max(365),
  observacao: z.string().max(2000).optional(),
});

const medicamentoSchema = z.object({
  nome: z.string().min(1).max(200),
  dose: z.string().min(1).max(50),
  via: z.string().max(40).optional(),
  frequencia: z.string().max(50).optional(),
  duracao: z.string().max(50).optional(),
});

const receitaSimplesSchema = z.object({
  medicamentos: z.array(medicamentoSchema).min(1).max(50),
  observacao: z.string().max(2000).optional(),
});

const receitaControladoSchema = receitaSimplesSchema.extend({
  numeroSequencial: z.string().min(1).max(40),
  tarjaTipo: z.enum(['A1', 'A2', 'A3', 'B1', 'B2', 'C1', 'C2', 'C3', 'C4', 'C5']),
});

const declaracaoSchema = z.object({
  texto: z.string().min(1).max(4000),
  finalidade: z.string().min(1).max(200),
});

const encaminhamentoSchema = z.object({
  especialidade: z.string().min(1).max(200),
  motivo: z.string().min(1).max(2000),
  urgencia: z.enum(['ELETIVO', 'PRIORIDADE', 'URGENTE', 'EMERGENCIAL']),
});

const resumoAltaSchema = z.object({
  diagnosticosCID: z.array(z.string().min(1).max(20)).min(1),
  procedimentosRealizados: z.string().min(1).max(4000),
  prescricoesEmAlta: z.string().max(4000).optional().default(''),
  recomendacoes: z.string().max(4000).optional().default(''),
});

const outroSchema = z.record(z.unknown());

function validatePayload(tipo: string, conteudo: unknown): Record<string, unknown> {
  switch (tipo) {
    case 'ATESTADO':
      return atestadoSchema.parse(conteudo);
    case 'RECEITA_SIMPLES':
      return receitaSimplesSchema.parse(conteudo);
    case 'RECEITA_CONTROLADO':
      return receitaControladoSchema.parse(conteudo);
    case 'DECLARACAO':
      return declaracaoSchema.parse(conteudo);
    case 'ENCAMINHAMENTO':
      return encaminhamentoSchema.parse(conteudo);
    case 'RESUMO_ALTA':
      return resumoAltaSchema.parse(conteudo);
    case 'OUTRO':
      return outroSchema.parse(conteudo);
    default:
      throw new Error(`Tipo de documento desconhecido: ${tipo}`);
  }
}

@Injectable()
export class EmitirDocumentoUseCase {
  constructor(
    private readonly repo: PepRepository,
    private readonly pdf: PdfRendererService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    atendimentoUuid: string,
    dto: EmitirDocumentoDto,
  ): Promise<DocumentoResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('EmitirDocumentoUseCase requires a request context.');
    }

    const atend = await this.repo.findAtendimentoBasic(atendimentoUuid);
    if (atend === null) {
      throw new NotFoundException({
        code: 'ATENDIMENTO_NOT_FOUND',
        message: 'Atendimento não encontrado.',
      });
    }
    if (TERMINAL.has(atend.status)) {
      throw new ConflictException({
        code: 'ATENDIMENTO_ESTADO_TERMINAL',
        message: `Não é permitido emitir documentos em atendimento ${atend.status}.`,
      });
    }

    let emissorId: bigint | null = null;
    if (dto.emissorUuid !== undefined) {
      emissorId = await this.repo.findPrestadorIdByUuid(dto.emissorUuid);
      if (emissorId === null) {
        throw new NotFoundException({
          code: 'EMISSOR_NOT_FOUND',
          message: 'Emissor (prestador) não encontrado.',
        });
      }
    } else {
      emissorId = await this.repo.findPrestadorIdByUser(ctx.userId);
      if (emissorId === null) {
        throw new UnprocessableEntityException({
          code: 'USUARIO_SEM_PRESTADOR',
          message:
            'Usuário não está vinculado a um cadastro de prestador (necessário para emitir documento).',
        });
      }
    }

    let conteudoValid: Record<string, unknown>;
    try {
      conteudoValid = validatePayload(dto.tipo, dto.conteudo);
    } catch (err: unknown) {
      throw new UnprocessableEntityException({
        code: 'DOCUMENTO_CONTEUDO_INVALIDO',
        message:
          err instanceof Error
            ? err.message
            : 'Conteúdo inválido para o tipo de documento.',
      });
    }

    const inserted = await this.repo.insertDocumento({
      tenantId: ctx.tenantId,
      atendimentoId: atend.id,
      pacienteId: atend.paciente_id,
      emissorId,
      tipo: dto.tipo,
      conteudo: conteudoValid,
      validadeDias: dto.validadeDias ?? null,
    });

    // Renderizar HTML+PDF (placeholder Fase 6 — Puppeteer real em Fase 13).
    const paciente = await this.repo.findPacienteBasic(atend.paciente_id);
    const emissorBasic = await this.repo.findPrestadorBasic(emissorId);
    const { pdfUrl } = await this.pdf.renderEPersistir(inserted.uuid_externo, {
      tipo: dto.tipo,
      pacienteNome: paciente?.nome ?? 'Paciente',
      pacienteNascimento: paciente?.data_nascimento ?? null,
      emissorNome: emissorBasic?.nome ?? 'Emissor',
      emissorRegistro: emissorBasic?.registro_conselho ?? null,
      dataEmissao: new Date().toISOString(),
      conteudo: conteudoValid,
    });
    await this.repo.setDocumentoPdfUrl(inserted.id, pdfUrl);

    await this.auditoria.record({
      tabela: 'documentos_emitidos',
      registroId: inserted.id,
      operacao: 'I',
      diff: {
        evento: 'documento.emitido',
        tipo: dto.tipo,
        atendimento_id: atend.id.toString(),
        emissor_id: emissorId.toString(),
        // PHI-safe: nada de conteúdo bruto (atestado tem CID).
      },
      finalidade: 'documento.emitido',
    });

    const row = await this.repo.findDocumentoByUuid(inserted.uuid_externo);
    if (row === null) {
      throw new Error('Documento emitido não encontrado.');
    }
    return presentDocumento(row);
  }
}
