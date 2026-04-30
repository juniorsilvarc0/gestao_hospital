/**
 * Body de `PATCH /tabelas-procedimentos/:uuid`. Todos os campos
 * opcionais — `codigoTuss` é imutável (alterá-lo cria registro novo).
 */
import { OmitType, PartialType } from '@nestjs/swagger';

import { CreateProcedimentoDto } from './create-procedimento.dto';

export class UpdateProcedimentoDto extends PartialType(
  OmitType(CreateProcedimentoDto, ['codigoTuss'] as const),
) {}
