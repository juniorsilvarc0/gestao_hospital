/**
 * Bounded Context: TISS — Fase 8 (Trilha R-B).
 *
 * Entrega:
 *   - Geração de guias TISS por tipo (CONSULTA, SP_SADT, INTERNACAO,
 *     HONORARIOS, OUTRAS_DESPESAS, RESUMO_INTERNACAO, ANEXO_OPME) com
 *     validação estrutural ANTES da persistência (CLAUDE.md §7).
 *   - Lotes (criar, validar, enviar, registrar protocolo, reenviar).
 *   - Hash SHA-256 de XML (`hash_xml`) em guia e lote para auditoria.
 *   - Triggers DB `tg_guia_tiss_imutavel` e `tg_lote_tiss_imutavel`
 *     atuam como linha de defesa final.
 *
 * Limitações conhecidas (TODOs):
 *   - Validação contra XSD oficial da ANS deferida para Fase 13
 *     (microsserviço Go). Aqui validamos estrutura via
 *     `tiss-validator` (campos obrigatórios + soma + datas).
 *   - Envio para webservice da operadora também stub na Fase 13.
 */
import { Module } from '@nestjs/common';

import { AuditoriaModule } from '../auditoria/auditoria.module';
import { GerarGuiasUseCase } from './application/guias/gerar-guias.use-case';
import { GetGuiaUseCase } from './application/guias/get-guia.use-case';
import { GetGuiaXmlUseCase } from './application/guias/get-guia-xml.use-case';
import { ListGuiasUseCase } from './application/guias/list-guias.use-case';
import { CriarLoteUseCase } from './application/lotes/criar-lote.use-case';
import { EnviarLoteUseCase } from './application/lotes/enviar-lote.use-case';
import { GetLoteUseCase } from './application/lotes/get-lote.use-case';
import { ListLotesUseCase } from './application/lotes/list-lotes.use-case';
import { RegistrarProtocoloUseCase } from './application/lotes/registrar-protocolo.use-case';
import { ReenviarLoteUseCase } from './application/lotes/reenviar-lote.use-case';
import { ValidarLoteUseCase } from './application/lotes/validar-lote.use-case';
import { GuiasController } from './infrastructure/controllers/guias.controller';
import { LotesController } from './infrastructure/controllers/lotes.controller';
import { TissRepository } from './infrastructure/tiss.repository';

@Module({
  imports: [AuditoriaModule],
  controllers: [GuiasController, LotesController],
  providers: [
    TissRepository,
    // Guias:
    ListGuiasUseCase,
    GetGuiaUseCase,
    GetGuiaXmlUseCase,
    GerarGuiasUseCase,
    // Lotes:
    ListLotesUseCase,
    GetLoteUseCase,
    CriarLoteUseCase,
    ValidarLoteUseCase,
    EnviarLoteUseCase,
    RegistrarProtocoloUseCase,
    ReenviarLoteUseCase,
  ],
  exports: [TissRepository],
})
export class TissModule {}
