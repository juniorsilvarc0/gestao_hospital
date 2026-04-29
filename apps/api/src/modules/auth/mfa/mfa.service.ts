/**
 * MfaService — orquestra setup, verify, disable e enforcement do MFA TOTP.
 *
 * Responsabilidades:
 *   1. Gerar secret + QR code + recovery codes (enable).
 *   2. Cifrar secret antes de persistir (`pgp_sym_encrypt` via $queryRaw),
 *      decifrar APENAS para verificar o código.
 *   3. Verificar TOTP (window=1) ou recovery code (one-time, hashed).
 *   4. Desabilitar MFA exigindo password + código.
 *   5. Indicar à Trilha A se um perfil exige MFA (RN-SEG-02).
 *   6. Auditoria via $queryRaw em `auditoria_eventos` para todos os
 *      eventos relevantes — sem PHI/secret no payload.
 *
 * Fora deste escopo:
 *   - Hash/verify de senha do usuário (Trilha A) — recebemos via DI
 *     opcional. Quando presente, /disable usa-o; quando ausente, /disable
 *     responde 503 dizendo "auth core ainda não pronto".
 *   - Emitir JWT com `mfa: true` (Trilha A) — apenas exportamos
 *     `verifyAndConsume()` para o LoginUseCase chamar.
 */
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import type { EnableMfaResponseDto } from './dto/enable-mfa.dto';
import type { VerifyMfaResponseDto } from './dto/verify-mfa.dto';
import { TotpGenerator } from './infrastructure/totp-generator';
import {
  RECOVERY_CODE_HASHER,
  type RecoveryCodeHasher,
} from './infrastructure/recovery-code-hasher';

/**
 * Token Nest opcional para Trilha A injetar seu PasswordHasher do Auth
 * core. Se ausente, /disable retorna 503 (não conseguimos validar
 * senha sem ele — não vamos comparar argon2 manualmente aqui para
 * evitar duplicação de regras de password policy).
 */
export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
export interface PasswordHasher {
  verify(hashStored: string, plain: string): Promise<boolean>;
}

const RECOVERY_CODES_COUNT = 10;
const RECOVERY_CODE_BYTES = 4; // 4 bytes hex = 8 chars (32 bits entropia).

/** Perfis que, por RN-SEG-02, exigem MFA habilitado para autenticar. */
export const MFA_REQUIRED_PROFILES = [
  'ADMIN',
  'MEDICO',
  'FARMACEUTICO',
  'AUDITOR',
] as const;

export type MfaRequiredProfile = (typeof MFA_REQUIRED_PROFILES)[number];

/** Forma do registro lido de `usuarios` via $queryRaw. */
interface UsuarioRow {
  id: bigint;
  tenant_id: bigint;
  email: string;
  senha_hash: string | null;
  mfa_habilitado: boolean;
  mfa_secret_decifrado: string | null;
}

@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);
  private readonly encryptionKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly totp: TotpGenerator,
    @Inject(RECOVERY_CODE_HASHER)
    private readonly recoveryHasher: RecoveryCodeHasher,
    @Optional()
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasher | null = null,
  ) {
    const key = this.config.get<string>('MFA_ENCRYPTION_KEY');
    if (key === undefined || key.length < 16) {
      throw new Error(
        'MFA_ENCRYPTION_KEY ausente ou < 16 chars. Defina no .env.',
      );
    }
    this.encryptionKey = key;
  }

  // ────────────────────────────────────────────────────────────────────
  // ENABLE
  // ────────────────────────────────────────────────────────────────────

  /**
   * Gera secret novo, cifra e persiste em `usuarios.mfa_secret`. Gera
   * 10 recovery codes, hasheia e insere em `mfa_recovery_codes`.
   * `mfa_habilitado` permanece FALSE até o /verify confirmar.
   *
   * Idempotência: se já existe secret e `mfa_habilitado=false`, sobrescreve
   * (usuário pode re-iniciar o setup). Se `mfa_habilitado=true`,
   * 409 Conflict — exigir disable antes.
   */
  async enable(usuarioId: bigint): Promise<EnableMfaResponseDto> {
    const usuario = await this.findUsuarioOrThrow(usuarioId);
    if (usuario.mfa_habilitado) {
      throw new ConflictException({
        error_code: 'MFA_ALREADY_ENABLED',
        message: 'MFA já habilitado. Desabilite antes de gerar novo secret.',
      });
    }

    const enrollment = await this.totp.createEnrollment(usuario.email);
    const recoveryCodes = this.generateRecoveryCodes(RECOVERY_CODES_COUNT);
    const recoveryHashes = await Promise.all(
      recoveryCodes.map((c) => this.recoveryHasher.hash(c)),
    );

    await this.prisma.$transaction(async (tx) => {
      // 1. Cifrar e gravar o secret. pgp_sym_encrypt é determinístico-aleatório
      //    (cada chamada gera bytes de IV diferentes — bom).
      await tx.$executeRaw`
        UPDATE usuarios
           SET mfa_secret = encode(
                 pgp_sym_encrypt(${enrollment.secret}::TEXT, ${this.encryptionKey}::TEXT),
                 'base64'
               ),
               mfa_habilitado = FALSE,
               updated_at = now()
         WHERE id = ${usuarioId}
      `;

      // 2. Limpar recovery codes antigos (não usados) — usuário re-gerou.
      await tx.$executeRaw`
        DELETE FROM mfa_recovery_codes
         WHERE usuario_id = ${usuarioId}
           AND used_at IS NULL
      `;

      // 3. Inserir novos hashes.
      for (const hash of recoveryHashes) {
        await tx.$executeRaw`
          INSERT INTO mfa_recovery_codes (tenant_id, usuario_id, code_hash)
          VALUES (${usuario.tenant_id}, ${usuarioId}, ${hash})
        `;
      }
    });

    await this.audit(
      usuario.tenant_id,
      usuarioId,
      'mfa.enabled',
      { recovery_count: recoveryCodes.length },
    );

    return {
      secret: enrollment.secret,
      otpauthUrl: enrollment.otpauthUrl,
      qrCodeDataUrl: enrollment.qrCodeDataUrl,
      recoveryCodes,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // VERIFY
  // ────────────────────────────────────────────────────────────────────

  /**
   * Verifica um código (TOTP 6 dígitos OU recovery code 8 hex).
   *  - Se TOTP válido: marca mfa_habilitado=true (na primeira vez).
   *  - Se recovery code válido: marca usedAt; mantém mfa_habilitado.
   *  - Se inválido: lança UnauthorizedException com audit `verify_failed`.
   *
   * Trilha A consome este método pelo LoginUseCase (segundo fator).
   */
  async verifyAndConsume(
    usuarioId: bigint,
    codigo: string,
  ): Promise<VerifyMfaResponseDto> {
    const usuario = await this.findUsuarioOrThrow(usuarioId);

    const isRecoveryFormat = /^[a-f0-9]{8}$/.test(codigo);
    const isTotpFormat = /^\d{6}$/.test(codigo);

    if (!isRecoveryFormat && !isTotpFormat) {
      throw new UnauthorizedException({
        error_code: 'MFA_CODE_INVALID',
        message: 'Formato de código inválido.',
      });
    }

    if (isTotpFormat) {
      return this.verifyTotp(usuario, codigo);
    }
    return this.verifyRecovery(usuario, codigo);
  }

  private async verifyTotp(
    usuario: UsuarioRow,
    codigo: string,
  ): Promise<VerifyMfaResponseDto> {
    if (usuario.mfa_secret_decifrado === null) {
      throw new ConflictException({
        error_code: 'MFA_NOT_ENROLLED',
        message: 'MFA não foi inicializado. Chame /auth/mfa/enable.',
      });
    }
    const ok = this.totp.verify(codigo, usuario.mfa_secret_decifrado);
    if (!ok) {
      await this.audit(usuario.tenant_id, usuario.id, 'mfa.verify_failed', {
        kind: 'totp',
      });
      throw new UnauthorizedException({
        error_code: 'MFA_CODE_INVALID',
        message: 'Código inválido.',
      });
    }

    const habilitouAgora = !usuario.mfa_habilitado;
    if (habilitouAgora) {
      await this.prisma.$executeRaw`
        UPDATE usuarios
           SET mfa_habilitado = TRUE, updated_at = now()
         WHERE id = ${usuario.id}
      `;
    }

    const restantes = await this.countRecoveryRemaining(usuario.id);
    await this.audit(usuario.tenant_id, usuario.id, 'mfa.verified', {
      kind: 'totp',
      first_time: habilitouAgora,
    });

    return {
      success: true,
      habilitouAgora,
      usouRecoveryCode: false,
      recoveryCodesRestantes: restantes,
    };
  }

  private async verifyRecovery(
    usuario: UsuarioRow,
    codigo: string,
  ): Promise<VerifyMfaResponseDto> {
    if (!usuario.mfa_habilitado) {
      // Recovery code só faz sentido depois que o MFA foi confirmado.
      throw new ConflictException({
        error_code: 'MFA_NOT_ENABLED',
        message:
          'Recovery code só vale após habilitar MFA via /auth/mfa/verify com TOTP.',
      });
    }

    type RcRow = { id: bigint; code_hash: string };
    const candidates = await this.prisma.$queryRaw<RcRow[]>`
      SELECT id, code_hash
        FROM mfa_recovery_codes
       WHERE usuario_id = ${usuario.id}
         AND used_at IS NULL
       ORDER BY id ASC
    `;

    let matchedId: bigint | null = null;
    for (const row of candidates) {
      // Compara um a um — Argon2 verify é caro mas N=10 é OK e a
      // alternativa (HMAC determinístico) abaixaria o custo de ataque.
      const ok = await this.recoveryHasher.verify(row.code_hash, codigo);
      if (ok) {
        matchedId = row.id;
        break;
      }
    }

    if (matchedId === null) {
      await this.audit(usuario.tenant_id, usuario.id, 'mfa.verify_failed', {
        kind: 'recovery',
      });
      throw new UnauthorizedException({
        error_code: 'MFA_CODE_INVALID',
        message: 'Código inválido.',
      });
    }

    await this.prisma.$executeRaw`
      UPDATE mfa_recovery_codes
         SET used_at = now()
       WHERE id = ${matchedId}
    `;
    const restantes = await this.countRecoveryRemaining(usuario.id);
    await this.audit(usuario.tenant_id, usuario.id, 'mfa.recovery_used', {
      restantes,
    });

    return {
      success: true,
      habilitouAgora: false,
      usouRecoveryCode: true,
      recoveryCodesRestantes: restantes,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // DISABLE
  // ────────────────────────────────────────────────────────────────────

  async disable(
    usuarioId: bigint,
    password: string,
    codigo: string,
  ): Promise<{ success: true }> {
    if (this.passwordHasher === null) {
      // Trilha A ainda não publicou o PasswordHasher — bloqueia disable
      // até estar pronto. Evita criar caminho inseguro fallback.
      throw new ServiceUnavailableException({
        error_code: 'AUTH_NOT_READY',
        message:
          'Verificação de senha indisponível. Tente novamente mais tarde.',
      });
    }
    const usuario = await this.findUsuarioOrThrow(usuarioId);
    if (!usuario.mfa_habilitado) {
      throw new ConflictException({
        error_code: 'MFA_NOT_ENABLED',
        message: 'MFA não está habilitado.',
      });
    }
    if (usuario.senha_hash === null) {
      throw new ForbiddenException({
        error_code: 'PASSWORD_NOT_SET',
        message: 'Usuário sem senha definida — operação bloqueada.',
      });
    }

    const passwordOk = await this.passwordHasher.verify(
      usuario.senha_hash,
      password,
    );
    if (!passwordOk) {
      // Não auditar como mfa_disabled para não dar sinal a atacantes;
      // só registra a tentativa falha.
      await this.audit(usuario.tenant_id, usuarioId, 'mfa.verify_failed', {
        kind: 'disable_password',
      });
      throw new UnauthorizedException({
        error_code: 'INVALID_CREDENTIALS',
        message: 'Senha inválida.',
      });
    }

    if (usuario.mfa_secret_decifrado === null) {
      throw new ConflictException({
        error_code: 'MFA_NOT_ENROLLED',
        message: 'MFA secret ausente. Estado inconsistente — contate suporte.',
      });
    }
    const totpOk = this.totp.verify(codigo, usuario.mfa_secret_decifrado);
    if (!totpOk) {
      await this.audit(usuario.tenant_id, usuarioId, 'mfa.verify_failed', {
        kind: 'disable_totp',
      });
      throw new UnauthorizedException({
        error_code: 'MFA_CODE_INVALID',
        message: 'Código MFA inválido.',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE usuarios
           SET mfa_secret = NULL,
               mfa_habilitado = FALSE,
               updated_at = now()
         WHERE id = ${usuarioId}
      `;
      // Recovery codes não fazem sentido sem MFA — limpa não-usados.
      await tx.$executeRaw`
        DELETE FROM mfa_recovery_codes
         WHERE usuario_id = ${usuarioId}
           AND used_at IS NULL
      `;
    });

    await this.audit(usuario.tenant_id, usuarioId, 'mfa.disabled', {});
    return { success: true };
  }

  // ────────────────────────────────────────────────────────────────────
  // ENFORCEMENT (consumido pela Trilha A no LoginUseCase)
  // ────────────────────────────────────────────────────────────────────

  /**
   * Retorna true se o usuário tem qualquer dos perfis em
   * MFA_REQUIRED_PROFILES (RN-SEG-02). A Trilha A deve, no login:
   *
   *   const exige = await mfaService.requireMfaForProfiles(uid);
   *   if (exige && !usuario.mfaHabilitado) {
   *     throw 403 MFA_SETUP_REQUIRED → frontend força fluxo de setup.
   *   }
   *   if (usuario.mfaHabilitado) {
   *     // emite token "parcial" e exige /auth/mfa/verify antes do JWT final.
   *   }
   */
  async requireMfaForProfiles(usuarioId: bigint): Promise<boolean> {
    type Row = { codigo: string };
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT p.codigo
        FROM usuarios_perfis up
        JOIN perfis p ON p.id = up.perfil_id
       WHERE up.usuario_id = ${usuarioId}
         AND p.ativo = TRUE
    `;
    const setRequired = new Set<string>(MFA_REQUIRED_PROFILES);
    return rows.some((r) => setRequired.has(r.codigo));
  }

  // ────────────────────────────────────────────────────────────────────
  // INTERNALS
  // ────────────────────────────────────────────────────────────────────

  /**
   * Carrega usuário incluindo o secret JÁ DECIFRADO. A decifragem só
   * acontece dentro desta função e o valor é passado em memória — nunca
   * logado. Caller manipula só por valor de retorno.
   */
  private async findUsuarioOrThrow(usuarioId: bigint): Promise<UsuarioRow> {
    const rows = await this.prisma.$queryRaw<UsuarioRow[]>`
      SELECT id,
             tenant_id,
             email,
             senha_hash,
             mfa_habilitado,
             CASE WHEN mfa_secret IS NULL THEN NULL
                  ELSE pgp_sym_decrypt(decode(mfa_secret, 'base64')::BYTEA,
                                       ${this.encryptionKey}::TEXT)
             END AS mfa_secret_decifrado
        FROM usuarios
       WHERE id = ${usuarioId}
         AND deleted_at IS NULL
    `;
    if (rows.length === 0) {
      throw new NotFoundException({
        error_code: 'USER_NOT_FOUND',
        message: 'Usuário não encontrado.',
      });
    }
    return rows[0];
  }

  private generateRecoveryCodes(count: number): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      codes.push(randomBytes(RECOVERY_CODE_BYTES).toString('hex'));
    }
    return codes;
  }

  private async countRecoveryRemaining(usuarioId: bigint): Promise<number> {
    type Row = { c: bigint };
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT COUNT(*)::BIGINT AS c
        FROM mfa_recovery_codes
       WHERE usuario_id = ${usuarioId}
         AND used_at IS NULL
    `;
    return Number(rows[0]?.c ?? 0);
  }

  /**
   * Insere evento em `auditoria_eventos` sem PHI. `tabela=usuarios` e
   * `registro_id=usuarioId` para correlacionar com a entidade alvo.
   * Lê correlation/user/tenant do `app.current_*` setado pelo middleware
   * (Trilha C) com fallback para parâmetros explícitos.
   */
  private async audit(
    tenantId: bigint,
    usuarioId: bigint,
    operacao: string,
    detalhes: Record<string, unknown>,
  ): Promise<void> {
    try {
      const diff = JSON.stringify({ evento: operacao, ...detalhes });
      await this.prisma.$executeRaw`
        INSERT INTO auditoria_eventos
              (tenant_id, tabela, registro_id, operacao, diff,
               usuario_id, finalidade, correlation_id)
        VALUES (${tenantId},
                'usuarios',
                ${usuarioId},
                'U',
                ${diff}::JSONB,
                ${usuarioId},
                ${operacao},
                NULLIF(current_setting('app.current_correlation_id', TRUE), '')::UUID)
      `;
    } catch (err) {
      // Auditoria nunca deve quebrar o fluxo de auth — mas precisamos
      // saber que falhou. Sem PHI/secret no log.
      this.logger.error(
        `Falha ao gravar auditoria (${operacao}) usuario=${usuarioId}: ${
          (err as Error).message
        }`,
      );
    }
  }
}
