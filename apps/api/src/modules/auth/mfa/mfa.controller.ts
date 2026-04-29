/**
 * MfaController — endpoints REST do MFA TOTP.
 *
 *   POST /api/v1/auth/mfa/enable    → gera secret + QR + recovery codes.
 *   POST /api/v1/auth/mfa/verify    → confirma TOTP / recovery code.
 *   POST /api/v1/auth/mfa/disable   → desabilita MFA (password + código).
 *
 * Autenticação:
 *   - Todas exigem usuário autenticado (JwtAuthGuard da Trilha A —
 *     aplicado globalmente em APP_GUARD ou via @UseGuards no AuthModule).
 *   - `/enable` e `/disable` NÃO usam `@Public()` (precisam de JWT).
 *   - `/verify` é chamado tanto no setup quanto no segundo fator do
 *     login. No login, a Trilha A emite um JWT "parcial" (claim
 *     `mfa: false`) que ainda dá acesso a este endpoint mas NÃO a
 *     rotas com @RequireMfa(). Após /verify ok, ela troca por JWT
 *     final com `mfa: true`.
 *
 * Rate limit:
 *   - /verify usa `@Throttle` dedicado (5/min) — defesa contra
 *     brute-force de TOTP. /enable e /disable usam o throttle global
 *     (120/min) — não é caminho de ataque.
 */
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

import { DisableMfaDto } from './dto/disable-mfa.dto';
import type { EnableMfaResponseDto } from './dto/enable-mfa.dto';
import { VerifyMfaDto, type VerifyMfaResponseDto } from './dto/verify-mfa.dto';
import { MfaService } from './mfa.service';

@Controller('auth/mfa')
export class MfaController {
  constructor(private readonly mfaService: MfaService) {}

  @Post('enable')
  @HttpCode(HttpStatus.OK)
  async enable(@Req() req: Request): Promise<EnableMfaResponseDto> {
    const usuarioId = this.extractUserId(req);
    return this.mfaService.enable(usuarioId);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  // 5 tentativas / 60s por IP (Throttler default por padrão usa IP).
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  async verify(
    @Req() req: Request,
    @Body() dto: VerifyMfaDto,
  ): Promise<VerifyMfaResponseDto> {
    const usuarioId = this.extractUserId(req);
    return this.mfaService.verifyAndConsume(usuarioId, dto.codigo);
  }

  @Post('disable')
  @HttpCode(HttpStatus.OK)
  async disable(
    @Req() req: Request,
    @Body() dto: DisableMfaDto,
  ): Promise<{ success: true }> {
    const usuarioId = this.extractUserId(req);
    return this.mfaService.disable(usuarioId, dto.password, dto.codigo);
  }

  /**
   * Lê o id do usuário autenticado do `request.user` populado pelo
   * JwtAuthGuard da Trilha A. A `AuthenticatedUser` canônica
   * (src/common/types) já tipa `sub` como bigint.
   */
  private extractUserId(req: Request): bigint {
    const raw = req.user?.sub;
    if (raw === undefined || raw === null) {
      // 500 porque "JwtAuthGuard não rodou" é bug de configuração,
      // não credencial faltando — frontend não tem como remediar.
      throw new InternalServerErrorException({
        error_code: 'AUTH_GUARD_MISSING',
        message: 'Configuração de autenticação inválida.',
      });
    }
    return raw;
  }
}
