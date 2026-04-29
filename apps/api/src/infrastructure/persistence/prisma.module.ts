/**
 * Módulo global de persistência. Disponibiliza `PrismaService` em
 * qualquer outro módulo via injeção, sem precisar reimportar.
 */
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
