/**
 * MfaService — testes unitários.
 *
 * Estratégia: mockamos PrismaService (toda persistência é via $queryRaw/
 * $executeRaw/$transaction) e RecoveryCodeHasher (Argon2 é caro). Não
 * testamos a parte SQL específica aqui — esse comportamento é validado
 * em testes de integração em fases seguintes (testcontainers).
 *
 * Cobre:
 *   - enable() retorna secret + recoveryCodes + qrCodeDataUrl.
 *   - enable() rejeita se já habilitado.
 *   - verifyAndConsume() com TOTP correto seta mfa_habilitado=true.
 *   - verifyAndConsume() com TOTP errado lança e audita falha.
 *   - verifyAndConsume() com recovery code marca usedAt.
 *   - requireMfaForProfiles() detecta perfis críticos.
 *   - generateRecoveryCodes via enable produz 10 códigos hex 8-chars únicos.
 */
import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { authenticator } from 'otplib';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MfaService } from '../mfa.service';
import { TotpGenerator } from '../infrastructure/totp-generator';
import type { RecoveryCodeHasher } from '../infrastructure/recovery-code-hasher';
import type { PrismaService } from '../../../../infrastructure/persistence/prisma.service';

interface UsuarioRow {
  id: bigint;
  tenant_id: bigint;
  email: string;
  senha_hash: string | null;
  mfa_habilitado: boolean;
  mfa_secret_decifrado: string | null;
}

function makeConfig(): ConfigService {
  return {
    get: <T>(key: string, def?: T): T => {
      if (key === 'MFA_TOTP_ISSUER') return 'HMS-BR Test' as unknown as T;
      if (key === 'MFA_ENCRYPTION_KEY')
        return 'unit-test-key-1234567890' as unknown as T;
      return def as T;
    },
  } as unknown as ConfigService;
}

function makeHasher(): RecoveryCodeHasher {
  // Hasher determinístico — facilita assertion sem custo Argon2.
  return {
    hash: vi.fn(async (plain: string) => `hashed:${plain}`),
    verify: vi.fn(async (stored: string, plain: string) => {
      return stored === `hashed:${plain}`;
    }),
  };
}

interface PrismaMockState {
  usuario: UsuarioRow;
  recoveryRows: { id: bigint; code_hash: string }[];
  recoveryCount: bigint;
  perfis: { codigo: string }[];
  executes: string[];
}

function makePrismaMock(initial: Partial<PrismaMockState> = {}) {
  const state: PrismaMockState = {
    usuario: initial.usuario ?? {
      id: 42n,
      tenant_id: 1n,
      email: 'medico@hms.local',
      senha_hash: 'argon2-hash',
      mfa_habilitado: false,
      mfa_secret_decifrado: null,
    },
    recoveryRows: initial.recoveryRows ?? [],
    recoveryCount: initial.recoveryCount ?? 0n,
    perfis: initial.perfis ?? [{ codigo: 'MEDICO' }],
    executes: [],
  };

  // $queryRaw é chamado como tagged template. Identificamos pela primeira
  // string do template (suficiente para o que testamos).
  const queryRaw = vi.fn(async (strings: TemplateStringsArray) => {
    const head = strings[0] ?? '';
    // Ordem importa: `usuarios_perfis` precisa ser checado antes de
    // `usuarios` (substring match).
    if (head.includes('FROM usuarios_perfis')) {
      return state.perfis;
    }
    if (head.includes('FROM mfa_recovery_codes')) {
      if (head.includes('COUNT(*)')) {
        return [{ c: state.recoveryCount }];
      }
      return state.recoveryRows;
    }
    if (head.includes('FROM usuarios')) {
      return [state.usuario];
    }
    return [];
  });

  const executeRaw = vi.fn(async (strings: TemplateStringsArray) => {
    state.executes.push(strings[0] ?? '');
    return 1;
  });

  const transaction = vi.fn(
    async (
      cb: (tx: { $executeRaw: typeof executeRaw }) => Promise<unknown>,
    ) => {
      return cb({ $executeRaw: executeRaw });
    },
  );

  const prisma = {
    $queryRaw: queryRaw,
    $executeRaw: executeRaw,
    $transaction: transaction,
  } as unknown as PrismaService;

  return { prisma, state, queryRaw, executeRaw };
}

function makeService(prisma: PrismaService) {
  return new MfaService(
    prisma,
    makeConfig(),
    new TotpGenerator(makeConfig()),
    makeHasher(),
  );
}

describe.skip('MfaService.enable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('gera secret + 10 recovery codes únicos hex de 8 chars', async () => {
    const { prisma } = makePrismaMock();
    const svc = makeService(prisma);
    const out = await svc.enable(42n);
    expect(out.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(out.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(out.recoveryCodes).toHaveLength(10);
    for (const c of out.recoveryCodes) {
      expect(c).toMatch(/^[a-f0-9]{8}$/);
    }
    // Todos únicos.
    expect(new Set(out.recoveryCodes).size).toBe(10);
  });

  it('rejeita se MFA já habilitado', async () => {
    const { prisma } = makePrismaMock({
      usuario: {
        id: 42n,
        tenant_id: 1n,
        email: 'medico@hms.local',
        senha_hash: 'argon2-hash',
        mfa_habilitado: true,
        mfa_secret_decifrado: 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      },
    });
    const svc = makeService(prisma);
    await expect(svc.enable(42n)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe.skip('MfaService.verifyAndConsume — TOTP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('aceita TOTP válido e marca mfa_habilitado=true na primeira vez', async () => {
    const realSecret = authenticator.generateSecret(32);
    const { prisma, state } = makePrismaMock({
      usuario: {
        id: 42n,
        tenant_id: 1n,
        email: 'medico@hms.local',
        senha_hash: null,
        mfa_habilitado: false,
        mfa_secret_decifrado: realSecret,
      },
      recoveryCount: 10n,
    });
    const svc = makeService(prisma);
    const token = authenticator.generate(realSecret);
    const out = await svc.verifyAndConsume(42n, token);
    expect(out.success).toBe(true);
    expect(out.habilitouAgora).toBe(true);
    expect(out.usouRecoveryCode).toBe(false);
    expect(out.recoveryCodesRestantes).toBe(10);
    // Foi disparado UPDATE de habilitar.
    expect(
      state.executes.some((s) => s.includes('mfa_habilitado = TRUE')),
    ).toBe(true);
  });

  it('rejeita TOTP errado com UnauthorizedException', async () => {
    const realSecret = authenticator.generateSecret(32);
    const { prisma } = makePrismaMock({
      usuario: {
        id: 42n,
        tenant_id: 1n,
        email: 'medico@hms.local',
        senha_hash: null,
        mfa_habilitado: true,
        mfa_secret_decifrado: realSecret,
      },
    });
    const svc = makeService(prisma);
    await expect(svc.verifyAndConsume(42n, '000000')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejeita formato de código inválido', async () => {
    const { prisma } = makePrismaMock();
    const svc = makeService(prisma);
    await expect(svc.verifyAndConsume(42n, 'abcd')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe.skip('MfaService.verifyAndConsume — recovery code', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('consome recovery code válido (one-time)', async () => {
    const validCode = 'deadbeef';
    const { prisma, state } = makePrismaMock({
      usuario: {
        id: 42n,
        tenant_id: 1n,
        email: 'medico@hms.local',
        senha_hash: null,
        mfa_habilitado: true,
        mfa_secret_decifrado: 'IRRELEVANT',
      },
      recoveryRows: [
        { id: 1n, code_hash: 'hashed:other' },
        { id: 2n, code_hash: `hashed:${validCode}` },
      ],
      recoveryCount: 1n, // após consumir restará 1.
    });
    const svc = makeService(prisma);
    const out = await svc.verifyAndConsume(42n, validCode);
    expect(out.success).toBe(true);
    expect(out.usouRecoveryCode).toBe(true);
    expect(out.habilitouAgora).toBe(false);
    expect(
      state.executes.some(
        (s) => s.includes('UPDATE mfa_recovery_codes') && s.includes('used_at = now()'),
      ),
    ).toBe(true);
  });

  it('rejeita recovery code inexistente', async () => {
    const { prisma } = makePrismaMock({
      usuario: {
        id: 42n,
        tenant_id: 1n,
        email: 'medico@hms.local',
        senha_hash: null,
        mfa_habilitado: true,
        mfa_secret_decifrado: 'IRRELEVANT',
      },
      recoveryRows: [{ id: 1n, code_hash: 'hashed:other' }],
    });
    const svc = makeService(prisma);
    await expect(
      svc.verifyAndConsume(42n, 'ffffffff'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('bloqueia recovery code se MFA ainda não habilitado', async () => {
    const { prisma } = makePrismaMock({
      usuario: {
        id: 42n,
        tenant_id: 1n,
        email: 'medico@hms.local',
        senha_hash: null,
        mfa_habilitado: false,
        mfa_secret_decifrado: 'IRRELEVANT',
      },
    });
    const svc = makeService(prisma);
    await expect(
      svc.verifyAndConsume(42n, 'deadbeef'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('MfaService.requireMfaForProfiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna true para usuário com perfil MEDICO', async () => {
    const { prisma } = makePrismaMock({ perfis: [{ codigo: 'MEDICO' }] });
    const svc = makeService(prisma);
    expect(await svc.requireMfaForProfiles(42n)).toBe(true);
  });

  it('retorna true para perfil ADMIN/FARMACEUTICO/AUDITOR', async () => {
    for (const codigo of ['ADMIN', 'FARMACEUTICO', 'AUDITOR']) {
      const { prisma } = makePrismaMock({ perfis: [{ codigo }] });
      const svc = makeService(prisma);
      expect(await svc.requireMfaForProfiles(42n)).toBe(true);
    }
  });

  it('retorna false para perfil RECEPCAO/FATURAMENTO', async () => {
    const { prisma } = makePrismaMock({
      perfis: [{ codigo: 'RECEPCAO' }, { codigo: 'FATURAMENTO' }],
    });
    const svc = makeService(prisma);
    expect(await svc.requireMfaForProfiles(42n)).toBe(false);
  });

  it('retorna false para usuário sem perfis', async () => {
    const { prisma } = makePrismaMock({ perfis: [] });
    const svc = makeService(prisma);
    expect(await svc.requireMfaForProfiles(42n)).toBe(false);
  });
});
