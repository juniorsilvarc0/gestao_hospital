/**
 * Bounded Context: CME (Esterilização) — Fase 10 Trilha R-A.
 *
 * Entrega:
 *   - CRUD de lotes com state machine (EM_PROCESSAMENTO →
 *     LIBERADO/REPROVADO; LIBERADO → EXPIRADO via job batch — RN-CME-01,
 *     RN-CME-04).
 *   - Reprovação cascateia DESCARTADO em todos os artigos (RN-CME-03).
 *   - Movimentação de artigos com matriz de transições válidas
 *     (RN-CME-02). Trigger DB `tg_cme_movimentacao_atualiza_artigo` é
 *     que efetivamente atualiza `etapa_atual` + `ultima_movimentacao`.
 *   - Rastreabilidade EM_USO grava paciente/cirurgia (RN-CME-05).
 *   - Eventos: `cme.lote_liberado`, `cme.lote_reprovado`,
 *     `cme.lote_expirado`, `cme.artigo_movimentado` via EventEmitter2.
 */
import { Module } from '@nestjs/common';

import { AuditoriaModule } from '../auditoria/auditoria.module';
import { CreateArtigoUseCase } from './application/artigos/create-artigo.use-case';
import { GetArtigoUseCase } from './application/artigos/get-artigo.use-case';
import { GetHistoricoUseCase } from './application/artigos/get-historico.use-case';
import { ListArtigosUseCase } from './application/artigos/list-artigos.use-case';
import { MovimentarArtigoUseCase } from './application/artigos/movimentar-artigo.use-case';
import { CreateLoteUseCase } from './application/lotes/create-lote.use-case';
import { GetLoteUseCase } from './application/lotes/get-lote.use-case';
import { LiberarLoteUseCase } from './application/lotes/liberar-lote.use-case';
import { ListLotesUseCase } from './application/lotes/list-lotes.use-case';
import { MarcarLoteExpiradoUseCase } from './application/lotes/marcar-expirado.use-case';
import { ReprovarLoteUseCase } from './application/lotes/reprovar-lote.use-case';
import { CmeRepository } from './infrastructure/cme.repository';
import { ArtigosController } from './infrastructure/controllers/artigos.controller';
import { LotesController } from './infrastructure/controllers/lotes.controller';

@Module({
  imports: [AuditoriaModule],
  controllers: [LotesController, ArtigosController],
  providers: [
    CmeRepository,
    // Lotes
    ListLotesUseCase,
    GetLoteUseCase,
    CreateLoteUseCase,
    LiberarLoteUseCase,
    ReprovarLoteUseCase,
    MarcarLoteExpiradoUseCase,
    // Artigos
    ListArtigosUseCase,
    GetArtigoUseCase,
    CreateArtigoUseCase,
    MovimentarArtigoUseCase,
    GetHistoricoUseCase,
  ],
  exports: [CmeRepository],
})
export class CmeModule {}
