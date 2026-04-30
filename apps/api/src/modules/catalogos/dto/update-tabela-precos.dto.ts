/**
 * Body de `PATCH /tabelas-precos/:uuid`.
 *
 * Snapshot por versão (RN-FAT-02): alterar uma tabela ativa NÃO
 * impacta contas já fechadas. Cliente pode bumpar `versao` (cria nova
 * versão preservando histórico) ou só ajustar metadados (vigência).
 */
import { PartialType } from '@nestjs/swagger';

import { CreateTabelaPrecosDto } from './create-tabela-precos.dto';

export class UpdateTabelaPrecosDto extends PartialType(CreateTabelaPrecosDto) {}
