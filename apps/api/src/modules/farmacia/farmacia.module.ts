/**
 * Bounded Context: Pharmacy — Fase 7 (Trilha Farmácia).
 *
 * Entrega:
 *   - Dispensações (PRESCRICAO/AVULSA/KIT_CIRURGICO/DEVOLUCAO) com
 *     transição PENDENTE → SEPARADA → DISPENSADA — RN-FAR-01..07.
 *   - Livro de controlados (Portaria 344/SVS-MS) com validação de
 *     saldo no app antes da trigger — RN-FAR-05.
 *   - Painel em tempo real via Socket.IO no namespace `/farmacia`,
 *     rooms por tenant + turno (MANHA/TARDE/NOITE/MADRUGADA) — RN-FAR-08.
 *   - Auditoria (`AuditoriaService.record`) em criação, separação,
 *     dispensação, devolução e lançamento manual no livro.
 *
 * Reusa:
 *   - `PermissionChecker` do módulo `prescricoes` para checagem ad-hoc
 *     da permissão `dispensacao:avulsa`.
 *
 * Não cobre nesta fase (planejado para Fase 8):
 *   - Cálculo de valor unitário/valor total de `contas_itens`.
 *   - Geração TISS dos itens dispensados.
 */
import { Module } from '@nestjs/common';

import { AuditoriaModule } from '../auditoria/auditoria.module';
import { PrescricoesModule } from '../prescricoes/prescricoes.module';
import { PermissionChecker } from '../prescricoes/infrastructure/permission-checker.service';
import { LancarMovimentoUseCase } from './application/controlados/lancar-movimento.use-case';
import { ListLivroControladosUseCase } from './application/controlados/list-livro.use-case';
import { CreateDispensacaoUseCase } from './application/dispensacoes/create-dispensacao.use-case';
import { DevolverDispensacaoUseCase } from './application/dispensacoes/devolver-dispensacao.use-case';
import { DispensarDispensacaoUseCase } from './application/dispensacoes/dispensar-dispensacao.use-case';
import { SepararDispensacaoUseCase } from './application/dispensacoes/separar-dispensacao.use-case';
import { GetPainelFarmaciaUseCase } from './application/painel/get-painel-farmacia.use-case';
import { DispensacoesController } from './infrastructure/controllers/dispensacoes.controller';
import { FarmaciaController } from './infrastructure/controllers/farmacia.controller';
import { FarmaciaGateway } from './infrastructure/farmacia.gateway';
import { FarmaciaRepository } from './infrastructure/farmacia.repository';

@Module({
  imports: [AuditoriaModule, PrescricoesModule],
  controllers: [DispensacoesController, FarmaciaController],
  providers: [
    FarmaciaRepository,
    FarmaciaGateway,
    PermissionChecker,
    CreateDispensacaoUseCase,
    SepararDispensacaoUseCase,
    DispensarDispensacaoUseCase,
    DevolverDispensacaoUseCase,
    GetPainelFarmaciaUseCase,
    LancarMovimentoUseCase,
    ListLivroControladosUseCase,
  ],
  exports: [FarmaciaRepository, FarmaciaGateway],
})
export class FarmaciaModule {}
