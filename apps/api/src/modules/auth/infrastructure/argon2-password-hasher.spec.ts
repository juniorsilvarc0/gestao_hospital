import { describe, expect, it } from 'vitest';
import { Argon2PasswordHasher } from './argon2-password-hasher';

describe('Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher();

  it('hashes a plain password and verifies match', async () => {
    const plain = 'CorrectHorseBatteryStaple-12345';
    const hash = await hasher.hash(plain);
    expect(hash).toMatch(/^\$argon2id\$/);
    const ok = await hasher.verify(hash, plain);
    expect(ok).toBe(true);
  });

  it('rejects incorrect password (constant-time)', async () => {
    const plain = 'CorrectHorseBatteryStaple-12345';
    const hash = await hasher.hash(plain);
    const ok = await hasher.verify(hash, 'wrong-password-attempt-aaaa');
    expect(ok).toBe(false);
  });

  it('returns false when hash is malformed (no throw)', async () => {
    const ok = await hasher.verify('not-a-real-hash', 'whatever');
    expect(ok).toBe(false);
  });

  it('uses argon2id with memoryCost ≥ 64MB', async () => {
    const plain = 'Some Strong Passphrase 9999';
    const hash = await hasher.hash(plain);
    // hash format: $argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>
    const match = /\$m=(\d+),t=(\d+),p=(\d+)/.exec(hash);
    expect(match).not.toBeNull();
    const m = Number(match?.[1]);
    const t = Number(match?.[2]);
    const p = Number(match?.[3]);
    expect(m).toBeGreaterThanOrEqual(65536);
    expect(t).toBeGreaterThanOrEqual(3);
    expect(p).toBeGreaterThanOrEqual(4);
  });

  it('produces different hashes for the same password (random salt)', async () => {
    const plain = 'Same-Plain-Text-12345-qwerty';
    const a = await hasher.hash(plain);
    const b = await hasher.hash(plain);
    expect(a).not.toEqual(b);
    expect(await hasher.verify(a, plain)).toBe(true);
    expect(await hasher.verify(b, plain)).toBe(true);
  });
});
