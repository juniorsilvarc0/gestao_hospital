/**
 * Testa `PacienteContextResolver`:
 *   - Sem request context → 403.
 *   - Usuário com tipo_perfil != PACIENTE → 403.
 *   - Usuário PACIENTE sem paciente_id → 403.
 *   - Usuário PACIENTE com vínculo válido → resolve corretamente.
 */
import { ForbiddenException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RequestContextStorage } from '../../../common/context/request-context';
import { PacienteContextResolver } from '../domain/paciente-context';

interface UserRow {
  paciente_id: bigint | null;
  tipo_perfil: 'INTERNO' | 'PRESTADOR' | 'PACIENTE';
  paciente_uuid: string | null;
}

class FakeTx {
  constructor(public rows: UserRow[]) {}
  $queryRaw = vi.fn(async () => this.rows);
}

class FakePrisma {
  public lastTx?: FakeTx;
  setRows(rows: UserRow[]) {
    this.lastTx = new FakeTx(rows);
  }
  tx() {
    if (this.lastTx === undefined) {
      throw new Error('Test setRows() before resolve()');
    }
    return this.lastTx;
  }
}

const ctxBase = {
  tenantId: 1n,
  userId: 42n,
  correlationId: '00000000-0000-0000-0000-000000000000',
  tx: {} as never,
};

function withCtx<T>(fn: () => Promise<T> | T): Promise<T> | T {
  return RequestContextStorage.run(ctxBase, fn);
}

describe('PacienteContextResolver', () => {
  let prisma: FakePrisma;
  let resolver: PacienteContextResolver;

  beforeEach(() => {
    prisma = new FakePrisma();
    resolver = new PacienteContextResolver(
      prisma as unknown as import('../../../infrastructure/persistence/prisma.service').PrismaService,
    );
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('lança 403 fora de request context', async () => {
    prisma.setRows([]);
    await expect(resolver.resolve()).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lança 403 quando usuário não existe', async () => {
    prisma.setRows([]);
    await expect(withCtx(() => resolver.resolve())).rejects.toMatchObject({
      response: { code: 'PORTAL_PACIENTE_USER_NOT_FOUND' },
    });
  });

  it('lança 403 quando tipo_perfil != PACIENTE', async () => {
    prisma.setRows([
      { paciente_id: null, tipo_perfil: 'INTERNO', paciente_uuid: null },
    ]);
    await expect(withCtx(() => resolver.resolve())).rejects.toMatchObject({
      response: { code: 'PORTAL_PACIENTE_FORBIDDEN_PROFILE' },
    });
  });

  it('lança 403 quando PACIENTE sem paciente_id', async () => {
    prisma.setRows([
      { paciente_id: null, tipo_perfil: 'PACIENTE', paciente_uuid: null },
    ]);
    await expect(withCtx(() => resolver.resolve())).rejects.toMatchObject({
      response: { code: 'PORTAL_PACIENTE_NO_PATIENT_LINK' },
    });
  });

  it('resolve corretamente quando tudo confere', async () => {
    prisma.setRows([
      {
        paciente_id: 99n,
        tipo_perfil: 'PACIENTE',
        paciente_uuid: '11111111-1111-4111-8111-111111111111',
      },
    ]);
    const ctx = await withCtx(() => resolver.resolve());
    expect(ctx).toEqual({
      tenantId: 1n,
      userId: 42n,
      pacienteId: 99n,
      pacienteUuid: '11111111-1111-4111-8111-111111111111',
    });
  });
});

describe('consentimento domain helpers', () => {
  // Sanity de helpers usados nos use cases.
  it('valida versão semver-like', async () => {
    const {
      isValidVersaoTermo,
      isValidTextoApresentado,
      isValidMotivoRevogacao,
      isValidFinalidade,
    } = await import('../domain/consentimento');
    expect(isValidVersaoTermo('v1.0.0')).toBe(true);
    expect(isValidVersaoTermo('1.2')).toBe(true);
    expect(isValidVersaoTermo('1')).toBe(false);
    expect(isValidVersaoTermo('vfoo')).toBe(false);
    expect(isValidTextoApresentado('curto')).toBe(false);
    expect(isValidTextoApresentado('a'.repeat(20))).toBe(true);
    expect(isValidMotivoRevogacao('hi!')).toBe(false);
    expect(isValidMotivoRevogacao('motivo válido')).toBe(true);
    expect(isValidFinalidade('TERMO_USO_PORTAL')).toBe(true);
    expect(isValidFinalidade('OUTRO_QUALQUER')).toBe(false);
  });
});
