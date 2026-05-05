/**
 * Testes do helper `exportar` + `downloadBlob` (Fase 12 R-C).
 *
 *  - `exportar(view, formato, body)` chama POST /v1/bi/export?... com
 *    o body serializado e devolve `Blob`.
 *  - `downloadBlob(blob, filename)` cria object URL, dispara o clique
 *    em `<a>` e revoga o URL.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob, exportar } from '@/lib/bi-api';
import { useAuthStore } from '@/stores/auth-store';

describe('bi-api · export', () => {
  beforeEach(() => {
    useAuthStore.getState().reset();
    useAuthStore.getState().login({
      user: {
        id: '1',
        email: 'gestor@hms.local',
        nome: 'Gestor',
        tenantId: '1',
        perfis: ['GESTOR'],
        mfa: false,
      },
      accessToken: 'AT-EXPORT',
      refreshToken: 'RT',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.getState().reset();
  });

  it('envia POST /v1/bi/export com formato/view na querystring e retorna Blob', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      // Confirma que injetou Authorization Bearer
      const headers = init?.headers as Record<string, string> | undefined;
      expect(headers?.['Authorization']).toBe('Bearer AT-EXPORT');
      expect(headers?.['Content-Type']).toBe('application/json');
      expect(init?.method).toBe('POST');
      return new Response('col1;col2\nA;B\n', {
        status: 200,
        headers: { 'content-type': 'text/csv' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const blob = await exportar('mv_glosa_status', 'csv', {
      filtros: { competenciaInicio: '2026-01', competenciaFim: '2026-05' },
    });

    // Em jsdom o protótipo do Blob retornado por undici pode divergir do
    // global; verificamos o duck-typing.
    expect(blob).toBeDefined();
    expect(typeof (blob as Blob).text).toBe('function');
    const text = await (blob as Blob).text();
    expect(text).toContain('col1;col2');

    // Verifica a URL
    const callUrl = String(fetchMock.mock.calls[0][0]);
    expect(callUrl).toContain('/v1/bi/export');
    expect(callUrl).toContain('formato=csv');
    expect(callUrl).toContain('view=mv_glosa_status');
  });

  it('joga ApiError em response não-OK', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('boom', { status: 500 })),
    );
    await expect(
      exportar('mv_taxa_ocupacao_diaria', 'csv', { filtros: {} }),
    ).rejects.toThrow(/Falha ao exportar BI/);
  });

  it('downloadBlob cria object URL, clica no anchor e revoga o URL', () => {
    const createSpy = vi.fn(() => 'blob:fake-url');
    const revokeSpy = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      value: createSpy,
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: revokeSpy,
      configurable: true,
    });

    const clickSpy = vi.fn();
    const realCreate = document.createElement.bind(document);
    const createElSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => {
        const el = realCreate(tag) as HTMLElement & { click?: () => void };
        if (tag === 'a') {
          el.click = clickSpy;
        }
        return el as HTMLElement;
      });

    const blob = new Blob(['hello'], { type: 'text/csv' });
    downloadBlob(blob, 'foo.csv');

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeSpy).toHaveBeenCalledWith('blob:fake-url');

    createElSpy.mockRestore();
  });
});
