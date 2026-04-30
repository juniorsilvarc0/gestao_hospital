/**
 * Unit test do `CpfCryptoService`. Cobre só o pedaço puro (`hashCpf`,
 * `normalize`); cifragem real exige Postgres real (testcontainer no
 * pipeline de integração — fora do escopo unitário aqui).
 */
import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';

import { CpfCryptoService } from '../infrastructure/cpf-crypto.service';

function buildService(): CpfCryptoService {
  const config = {
    get: () => 'unit-test-pgcrypto-key-32bytes-min',
  } as unknown as ConfigService<never, true>;
  return new CpfCryptoService(config);
}

describe('CpfCryptoService', () => {
  it('hashCpf é determinístico (mesmo CPF → mesmo hash)', () => {
    const service = buildService();
    const a = service.hashCpf('529.982.247-25');
    const b = service.hashCpf('52998224725');
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('hashCpf produz hashes diferentes para CPFs diferentes', () => {
    const service = buildService();
    expect(service.hashCpf('52998224725')).not.toBe(
      service.hashCpf('11144477735'),
    );
  });

  it('hashCpf rejeita string vazia', () => {
    const service = buildService();
    expect(() => service.hashCpf('')).toThrow();
  });

  it('normalize devolve apenas dígitos', () => {
    const service = buildService();
    expect(service.normalize('123.456.789-00')).toBe('12345678900');
    expect(service.normalize(undefined)).toBeUndefined();
    expect(service.normalize(null)).toBeUndefined();
    expect(service.normalize('   ')).toBeUndefined();
  });
});
