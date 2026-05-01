/**
 * Bounded Context: Exames — Fase 6 / Trilha B (Round 2).
 *
 * Entrega:
 *   - Solicitações de exame (RN-LAB-01) com itens.
 *   - Marcar coleta (RN-LAB-02).
 *   - Cancelamento controlado.
 *   - Registro de resultado bruto (RN-LAB-03).
 *   - Laudo + assinatura ICP-Brasil (RN-LAB-04, INVARIANTE #3).
 *   - Listagens com filtros e paginação offset.
 *
 * Integrações:
 *   - `IcpBrasilSigner` via port (`ICP_BRASIL_SIGNER`). Provider default
 *     é o `LocalIcpBrasilStub`. Quando Trilha A R2 expor o
 *     `IcpBrasilService` real via `PepModule.exports`, troque para:
 *       imports: [forwardRef(() => PepModule)],
 *       providers: [
 *         { provide: ICP_BRASIL_SIGNER, useExisting: IcpBrasilService },
 *       ],
 *     (Mantemos o stub fora desse caminho para não criar dependência
 *     circular e permitir testes locais sem o PEP completo.)
 *
 *   - `AuditoriaService` (@Global) — emit de eventos lógicos
 *     (`exame.solicitado`, `exame.coletado`, `exame.resultado.registrado`,
 *     `exame.laudo.assinado`).
 *
 *   - `EventEmitter2` — emit `exame.laudo.assinado` para consumidores
 *     futuros (notificação paciente, faturamento, painel central).
 *
 * Importante:
 *   - Não exporta nada para outros módulos (consumo interno).
 *   - Trigger DDL `tg_imutavel_apos_assinado` enforça INVARIANTE #3 no
 *     banco — caso o use case `laudar` falhe em qualquer passo após
 *     `assinado_em` ser preenchido, o banco já bloqueia novas escritas.
 */
import { Module } from '@nestjs/common';

import { ResultadosExameController } from './resultados-exame.controller';
import {
  SolicitacoesExameController,
  SolicitacoesExameNestedController,
} from './solicitacoes-exame.controller';

// Use cases — solicitações
import { CancelarSolicitacaoUseCase } from './application/cancelar-solicitacao.use-case';
import { GetSolicitacaoUseCase } from './application/get-solicitacao.use-case';
import { ListSolicitacoesUseCase } from './application/list-solicitacoes.use-case';
import { MarcarColetaUseCase } from './application/marcar-coleta.use-case';
import { SolicitarExameUseCase } from './application/solicitar-exame.use-case';

// Use cases — resultados
import { GetResultadoUseCase } from './application/get-resultado.use-case';
import { LaudarResultadoUseCase } from './application/laudar-resultado.use-case';
import { ListResultadosUseCase } from './application/list-resultados.use-case';
import { RegistrarResultadoUseCase } from './application/registrar-resultado.use-case';

// Infra
import { ExamesRepository } from './infrastructure/exames.repository';
import {
  ICP_BRASIL_SIGNER,
  LocalIcpBrasilStub,
} from './infrastructure/icp-brasil.port';

@Module({
  controllers: [
    SolicitacoesExameController,
    SolicitacoesExameNestedController,
    ResultadosExameController,
  ],
  providers: [
    ExamesRepository,
    // Solicitações
    SolicitarExameUseCase,
    ListSolicitacoesUseCase,
    GetSolicitacaoUseCase,
    MarcarColetaUseCase,
    CancelarSolicitacaoUseCase,
    // Resultados / Laudos
    RegistrarResultadoUseCase,
    LaudarResultadoUseCase,
    ListResultadosUseCase,
    GetResultadoUseCase,
    // ICP-Brasil port + stub default. TODO Trilha A R2: trocar por
    // `useExisting: IcpBrasilService` (PepModule.exports).
    { provide: ICP_BRASIL_SIGNER, useClass: LocalIcpBrasilStub },
  ],
})
export class ExamesModule {}
