/**
 * AuthController — endpoints REST de autenticação.
 *
 * Convenção da Fase 1 (`enableVersioning({ type: URI, default: '1' })`):
 *   o controller declara `path: 'auth'`. URLs ficam `/v1/auth/...`.
 *   No `docs/05-apis-rest.md` aparecem como `/api/v1/auth/...`; o
 *   prefixo `/api` será adicionado pelo reverse proxy em produção.
 *
 * Endpoints:
 *   POST /auth/login            — público
 *   POST /auth/refresh          — público (usa refresh)
 *   POST /auth/logout           — público (idempotente; aceita refresh)
 *   POST /auth/logout-all       — autenticado (Bearer)
 *   POST /auth/password/change  — autenticado (Bearer)
 *   POST /auth/password/forgot  — público
 *   POST /auth/password/reset   — público
 */
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { LoginUseCase, type LoginOutput } from './application/login.use-case';
import { RefreshTokenUseCase } from './application/refresh-token.use-case';
import { LogoutUseCase } from './application/logout.use-case';
import { LogoutAllUseCase } from './application/logout-all.use-case';
import { ChangePasswordUseCase } from './application/change-password.use-case';
import { ForgotPasswordUseCase } from './application/forgot-password.use-case';
import { ResetPasswordUseCase } from './application/reset-password.use-case';
import { mapAuthDomainErrorToHttp } from './infrastructure/auth-domain.filter';
import { AccessTokenGuard } from './infrastructure/access-token.guard';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshUseCase: RefreshTokenUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly logoutAllUseCase: LogoutAllUseCase,
    private readonly changePasswordUseCase: ChangePasswordUseCase,
    private readonly forgotPasswordUseCase: ForgotPasswordUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login com email + senha (+ MFA quando aplicável).' })
  @ApiResponse({ status: 200, description: 'Tokens emitidos.' })
  @ApiResponse({ status: 401, description: 'Credenciais inválidas.' })
  @ApiResponse({ status: 423, description: 'Conta bloqueada.' })
  @ApiResponse({ status: 429, description: 'IP bloqueado.' })
  async login(@Body() dto: LoginDto, @Req() req: Request): Promise<LoginOutput> {
    try {
      return await this.loginUseCase.execute({
        tenantCode: dto.tenantCode,
        email: dto.email,
        senha: dto.senha,
        ip: this.extractIp(req),
        userAgent: this.extractUserAgent(req),
        correlationId: req.correlationId,
      });
    } catch (err) {
      mapAuthDomainErrorToHttp(err);
    }
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renova tokens; rotação obrigatória.' })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresIn: number;
    refreshTokenExpiresIn: number;
  }> {
    try {
      return await this.refreshUseCase.execute({
        refreshToken: dto.refreshToken,
        ip: this.extractIp(req),
        userAgent: this.extractUserAgent(req),
        correlationId: req.correlationId,
      });
    } catch (err) {
      mapAuthDomainErrorToHttp(err);
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Invalida o refresh atual.' })
  async logout(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.logoutUseCase.execute({
      refreshToken: dto.refreshToken,
      ip: this.extractIp(req),
      userAgent: this.extractUserAgent(req),
      correlationId: req.correlationId,
    });
  }

  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Invalida todas as sessões do usuário.' })
  async logoutAll(@Req() req: Request): Promise<{ revoked: number }> {
    const user = req.authUser;
    if (user === undefined) {
      // Defensive: AccessTokenGuard já garante.
      throw new Error('authUser missing');
    }
    return this.logoutAllUseCase.execute({
      usuarioId: user.usuarioId,
      tenantId: user.tenantId,
      ip: this.extractIp(req),
      userAgent: this.extractUserAgent(req),
      correlationId: req.correlationId,
    });
  }

  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @Post('password/change')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Troca a própria senha (autenticado).' })
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ): Promise<void> {
    const user = req.authUser;
    if (user === undefined) {
      throw new Error('authUser missing');
    }
    try {
      await this.changePasswordUseCase.execute({
        usuarioId: user.usuarioId,
        tenantId: user.tenantId,
        senhaAtual: dto.senhaAtual,
        novaSenha: dto.novaSenha,
        ip: this.extractIp(req),
        userAgent: this.extractUserAgent(req),
        correlationId: req.correlationId,
      });
    } catch (err) {
      mapAuthDomainErrorToHttp(err);
    }
  }

  @Public()
  @Post('password/forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Solicita link de reset por email.' })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    await this.forgotPasswordUseCase.execute({
      tenantCode: dto.tenantCode,
      email: dto.email,
      ...(dto.resetUrlBase !== undefined
        ? { resetUrlBase: dto.resetUrlBase }
        : {}),
      ip: this.extractIp(req),
      userAgent: this.extractUserAgent(req),
      correlationId: req.correlationId,
    });
    return { ok: true };
  }

  @Public()
  @Post('password/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Confirma reset de senha consumindo token.' })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Req() req: Request,
  ): Promise<void> {
    try {
      await this.resetPasswordUseCase.execute({
        token: dto.token,
        novaSenha: dto.novaSenha,
        ip: this.extractIp(req),
        userAgent: this.extractUserAgent(req),
        correlationId: req.correlationId,
      });
    } catch (err) {
      mapAuthDomainErrorToHttp(err);
    }
  }

  private extractIp(req: Request): string | undefined {
    // Prioriza X-Forwarded-For (proxy/LB), depois socket.
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.length > 0) {
      return fwd.split(',')[0]?.trim();
    }
    const value = req.ip ?? req.socket.remoteAddress;
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
    return undefined;
  }

  private extractUserAgent(req: Request): string | undefined {
    const ua = req.headers['user-agent'];
    if (typeof ua === 'string' && ua.length > 0) {
      return ua;
    }
    return undefined;
  }
}
