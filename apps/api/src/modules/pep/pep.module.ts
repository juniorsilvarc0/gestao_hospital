/**
 * Bounded Context: PEP / Prontuário Eletrônico — Fase 6.
 *
 * Entrega:
 *   - Evoluções multiprofissionais (RN-PEP-01..03) com TipTap sanitizado,
 *     assinatura ICP-Brasil (stub Fase 6), retificação como nova versão.
 *   - Sinais vitais (RN-PEP-04 / RN-ATE-04) — tabela particionada,
 *     validação fisiológica.
 *   - Documentos clínicos (atestado, receita, declaração, encaminhamento,
 *     resumo de alta) com Zod por tipo, render PDF placeholder, assinatura.
 *
 * Cross-cutting:
 *   - `PepAcessoInterceptor` — registra acesso a prontuário em
 *     `acessos_prontuario` (RN-LGP-01 / LGPD).
 *   - Reutilizado pelo `PrescricoesModule` (idem PHI).
 *
 * Exports:
 *   - `IcpBrasilService`, `PdfRendererService`, `PepRepository`,
 *     `PepAcessoInterceptor` — para que outros módulos (prescrições,
 *     exames, etc.) possam compor.
 */
import { Module } from '@nestjs/common';

import { DocumentosController } from './documentos.controller';
import { EvolucoesController } from './evolucoes.controller';
import { SinaisVitaisController } from './sinais-vitais.controller';

// Use cases — evoluções
import { AssinarEvolucaoUseCase } from './application/evolucoes/assinar-evolucao.use-case';
import { CreateEvolucaoUseCase } from './application/evolucoes/create-evolucao.use-case';
import { GetEvolucaoUseCase } from './application/evolucoes/get-evolucao.use-case';
import { ListEvolucoesUseCase } from './application/evolucoes/list-evolucoes.use-case';
import { RetificarEvolucaoUseCase } from './application/evolucoes/retificar-evolucao.use-case';
import { UpdateEvolucaoRascunhoUseCase } from './application/evolucoes/update-evolucao-rascunho.use-case';

// Use cases — sinais vitais
import { ListSinaisVitaisUseCase } from './application/sinais-vitais/list-sinais-vitais.use-case';
import { RegistrarSinaisVitaisUseCase } from './application/sinais-vitais/registrar-sinais-vitais.use-case';

// Use cases — documentos
import { AssinarDocumentoUseCase } from './application/documentos/assinar-documento.use-case';
import { BaixarDocumentoPdfUseCase } from './application/documentos/baixar-documento-pdf.use-case';
import { EmitirDocumentoUseCase } from './application/documentos/emitir-documento.use-case';
import { GetDocumentoUseCase } from './application/documentos/get-documento.use-case';
import { ListDocumentosUseCase } from './application/documentos/list-documentos.use-case';

// Infra
import { IcpBrasilService } from './infrastructure/icp-brasil.service';
import { PdfRendererService } from './infrastructure/pdf-renderer.service';
import { PepAcessoInterceptor } from './infrastructure/pep-acesso.interceptor';
import { PepRepository } from './infrastructure/pep.repository';

@Module({
  controllers: [
    EvolucoesController,
    SinaisVitaisController,
    DocumentosController,
  ],
  providers: [
    // Infra
    PepRepository,
    IcpBrasilService,
    PdfRendererService,
    PepAcessoInterceptor,

    // Evoluções
    ListEvolucoesUseCase,
    CreateEvolucaoUseCase,
    GetEvolucaoUseCase,
    UpdateEvolucaoRascunhoUseCase,
    AssinarEvolucaoUseCase,
    RetificarEvolucaoUseCase,

    // Sinais vitais
    ListSinaisVitaisUseCase,
    RegistrarSinaisVitaisUseCase,

    // Documentos
    EmitirDocumentoUseCase,
    ListDocumentosUseCase,
    GetDocumentoUseCase,
    BaixarDocumentoPdfUseCase,
    AssinarDocumentoUseCase,
  ],
  exports: [
    IcpBrasilService,
    PdfRendererService,
    PepRepository,
    PepAcessoInterceptor,
    // Fase 11 R-B (Portal Paciente) reusa o downloader p/ servir PDF
    // de receitas com validação de pertinência ao paciente logado.
    BaixarDocumentoPdfUseCase,
  ],
})
export class PepModule {}
