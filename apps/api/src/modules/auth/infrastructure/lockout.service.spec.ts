import { beforeEach, describe, expect, it } from 'vitest';
import {
  IP_THRESHOLD,
  IP_TTL_SECONDS,
  LockoutService,
  USER_THRESHOLD,
  USER_TTL_SECONDS,
} from './lockout.service';

/**
 * Mock minimalista do ioredis suficiente para LockoutService.
 *  - INCR  → incrementa key (default 0).
 *  - EXPIRE … NX → seta TTL apenas se ainda não houver.
 *  - GET   → string ou null.
 *  - DEL   → apaga.
 *  - MULTI/EXEC → executa pipeline batched.
 */
class FakeRedis {
  private store = new Map<string, number>();
  private ttls = new Map<string, number>();
  multi(): FakePipeline {
    return new FakePipeline(this);
  }
  async get(key: string): Promise<string | null> {
    const v = this.store.get(key);
    return v === undefined ? null : String(v);
  }
  async del(key: string): Promise<number> {
    const had = this.store.delete(key);
    this.ttls.delete(key);
    return had ? 1 : 0;
  }
  // helpers para o pipeline:
  _incr(key: string): number {
    const v = (this.store.get(key) ?? 0) + 1;
    this.store.set(key, v);
    return v;
  }
  _expireNx(key: string, ttl: number): number {
    if (this.ttls.has(key)) {
      return 0;
    }
    this.ttls.set(key, ttl);
    return 1;
  }
}

class FakePipeline {
  private ops: Array<() => unknown> = [];
  constructor(private readonly r: FakeRedis) {}
  incr(key: string): this {
    this.ops.push(() => this.r._incr(key));
    return this;
  }
  expire(key: string, ttl: number, _mode: 'NX'): this {
    this.ops.push(() => this.r._expireNx(key, ttl));
    return this;
  }
  async exec(): Promise<Array<[Error | null, unknown]>> {
    return this.ops.map((op) => [null, op()]);
  }
}

function buildService(): { svc: LockoutService; redis: FakeRedis } {
  const redis = new FakeRedis();
  // The service expects an ioredis-shaped client. Cast through unknown.
  const svc = new LockoutService(redis as unknown as never);
  return { svc, redis };
}

describe('LockoutService', () => {
  let svc: LockoutService;

  beforeEach(() => {
    svc = buildService().svc;
  });

  it('returns triggered=true exactly at the user threshold', async () => {
    let last;
    for (let i = 0; i < USER_THRESHOLD; i++) {
      last = await svc.registerUserFailure(1n);
    }
    expect(last?.triggered).toBe(true);
    expect(last?.attempts).toBe(USER_THRESHOLD);
    expect(last?.lockedUntil).toBeInstanceOf(Date);
  });

  it('does not trigger before threshold', async () => {
    const r1 = await svc.registerUserFailure(1n);
    expect(r1.triggered).toBe(false);
    expect(r1.attempts).toBe(1);
    expect(r1.lockedUntil).toBeNull();
  });

  it('increments IP counter independently', async () => {
    const r1 = await svc.registerIpFailure('10.0.0.1');
    const r2 = await svc.registerIpFailure('10.0.0.1');
    expect(r1.attempts).toBe(1);
    expect(r2.attempts).toBe(2);
  });

  it('triggers IP lockout at IP_THRESHOLD', async () => {
    let last;
    for (let i = 0; i < IP_THRESHOLD; i++) {
      last = await svc.registerIpFailure('10.0.0.2');
    }
    expect(last?.triggered).toBe(true);
    expect(last?.attempts).toBe(IP_THRESHOLD);
  });

  it('isIpLocked returns true after threshold and false before', async () => {
    expect(await svc.isIpLocked('10.0.0.3')).toBe(false);
    for (let i = 0; i < IP_THRESHOLD; i++) {
      await svc.registerIpFailure('10.0.0.3');
    }
    expect(await svc.isIpLocked('10.0.0.3')).toBe(true);
  });

  it('resetUser clears the counter', async () => {
    await svc.registerUserFailure(1n);
    await svc.registerUserFailure(1n);
    await svc.resetUser(1n);
    const after = await svc.registerUserFailure(1n);
    expect(after.attempts).toBe(1);
  });

  it('resetIp clears the counter', async () => {
    for (let i = 0; i < 3; i++) {
      await svc.registerIpFailure('10.0.0.4');
    }
    await svc.resetIp('10.0.0.4');
    expect(await svc.isIpLocked('10.0.0.4')).toBe(false);
  });

  it('exposes thresholds matching RN-SEG-03 (5/20)', () => {
    expect(USER_THRESHOLD).toBe(5);
    expect(USER_TTL_SECONDS).toBe(15 * 60);
    expect(IP_THRESHOLD).toBe(20);
    expect(IP_TTL_SECONDS).toBe(60 * 60);
  });
});
