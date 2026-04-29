/**
 * Unit test para `PermissionsCacheService` (modo memória — sem Redis).
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { PermissionsCacheService } from '../permissions-cache.service';

describe('PermissionsCacheService (memory mode)', () => {
  let svc: PermissionsCacheService;

  beforeEach(() => {
    delete process.env.REDIS_URL; // força modo só-memória
    svc = new PermissionsCacheService();
    svc.onModuleInit();
  });

  it('miss inicial → undefined', async () => {
    const out = await svc.get(1n, 'users', 'read');
    expect(out).toBeUndefined();
  });

  it('set/get round-trip — true', async () => {
    await svc.set(1n, 'users', 'read', true);
    const out = await svc.get(1n, 'users', 'read');
    expect(out).toBe(true);
  });

  it('set/get round-trip — false', async () => {
    await svc.set(2n, 'pacientes', 'write', false);
    expect(await svc.get(2n, 'pacientes', 'write')).toBe(false);
  });

  it('chaves são isoladas por usuário', async () => {
    await svc.set(1n, 'r', 'a', true);
    await svc.set(2n, 'r', 'a', false);
    expect(await svc.get(1n, 'r', 'a')).toBe(true);
    expect(await svc.get(2n, 'r', 'a')).toBe(false);
  });

  it('invalidateUser limpa todas as entradas do usuário', async () => {
    await svc.set(1n, 'users', 'read', true);
    await svc.set(1n, 'users', 'write', true);
    await svc.set(2n, 'users', 'read', true);
    await svc.invalidateUser(1n);
    expect(await svc.get(1n, 'users', 'read')).toBeUndefined();
    expect(await svc.get(1n, 'users', 'write')).toBeUndefined();
    expect(await svc.get(2n, 'users', 'read')).toBe(true);
  });
});
