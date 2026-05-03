/**
 * Testes da lista de doenças compulsórias (RN-CCI-03).
 */
import { describe, expect, it } from 'vitest';

import {
  DOENCAS_COMPULSORIAS,
  findCompulsoriaByCid,
  isCompulsoria,
} from '../domain/doencas-compulsorias';

describe('findCompulsoriaByCid', () => {
  it('encontra CID exato', () => {
    expect(findCompulsoriaByCid('A36')?.nome).toMatch(/Difteria/);
    expect(findCompulsoriaByCid('U07')?.nome).toMatch(/COVID/);
  });

  it('cai na categoria de 3 chars (ex: A150 → A15)', () => {
    expect(findCompulsoriaByCid('A150')?.cid).toBe('A15');
    expect(findCompulsoriaByCid('B201')?.cid).toBe('B20');
  });

  it('case-insensitive + trim', () => {
    expect(findCompulsoriaByCid('  a36  ')?.cid).toBe('A36');
    expect(findCompulsoriaByCid('a36')?.cid).toBe('A36');
  });

  it('retorna null para CID desconhecido', () => {
    expect(findCompulsoriaByCid('Z999')).toBeNull();
    expect(findCompulsoriaByCid(null)).toBeNull();
    expect(findCompulsoriaByCid(undefined)).toBeNull();
    expect(findCompulsoriaByCid('')).toBeNull();
  });
});

describe('isCompulsoria', () => {
  it('CIDs de IRAS comuns são compulsórias', () => {
    expect(isCompulsoria('A40')).toBe(true);
    expect(isCompulsoria('A41')).toBe(true);
    expect(isCompulsoria('T80')).toBe(true);
  });

  it('CIDs fora da lista não são compulsórios', () => {
    expect(isCompulsoria('Z999')).toBe(false);
    expect(isCompulsoria(null)).toBe(false);
  });
});

describe('DOENCAS_COMPULSORIAS — invariantes', () => {
  it('nenhuma duplicata de CID', () => {
    const cids = DOENCAS_COMPULSORIAS.map((d) => d.cid);
    expect(new Set(cids).size).toBe(cids.length);
  });

  it('todos os CIDs em uppercase', () => {
    for (const d of DOENCAS_COMPULSORIAS) {
      expect(d.cid).toBe(d.cid.toUpperCase());
    }
  });

  it('todos têm nome não-vazio', () => {
    for (const d of DOENCAS_COMPULSORIAS) {
      expect(d.nome.length).toBeGreaterThan(0);
    }
  });
});
