/**
 * Finalidade store — finalidade explícita de acesso a prontuário (LGPD).
 *
 * Toda navegação para o PEP precisa de uma `finalidade` declarada
 * (RN-LGP-01 / RN-PEP-07). Persiste em `sessionStorage` por chave de
 * atendimento + carimba `setAtMs` para revalidar a cada 30 minutos
 * (RN-PEP-07 — finalidade pode mudar conforme o ato).
 *
 * NÃO contém PHI — apenas o termo de finalidade e timestamp.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { FinalidadeAcesso } from '@/types/pep';

/** 30 minutos em ms — janela de validade da finalidade declarada. */
export const FINALIDADE_TTL_MS = 30 * 60 * 1000;

interface FinalidadeEntry {
  finalidade: FinalidadeAcesso;
  detalhe?: string;
  setAtMs: number;
}

interface FinalidadeState {
  entries: Record<string, FinalidadeEntry>;
}

interface FinalidadeActions {
  register: (
    atendimentoUuid: string,
    finalidade: FinalidadeAcesso,
    detalhe?: string,
  ) => void;
  clear: (atendimentoUuid: string) => void;
  reset: () => void;
}

export type FinalidadeStore = FinalidadeState & FinalidadeActions;

const STORAGE_KEY = 'hms.pep.finalidade.v1';

export const useFinalidadeStore = create<FinalidadeStore>()(
  persist(
    (set) => ({
      entries: {},
      register: (atendimentoUuid, finalidade, detalhe) =>
        set((state) => ({
          entries: {
            ...state.entries,
            [atendimentoUuid]: {
              finalidade,
              ...(detalhe ? { detalhe } : {}),
              setAtMs: Date.now(),
            },
          },
        })),
      clear: (atendimentoUuid) =>
        set((state) => {
          const { [atendimentoUuid]: _removed, ...rest } = state.entries;
          return { entries: rest };
        }),
      reset: () => set({ entries: {} }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          return {
            getItem: () => null,
            setItem: () => undefined,
            removeItem: () => undefined,
          };
        }
        return window.sessionStorage;
      }),
      partialize: (state) => ({ entries: state.entries }),
    },
  ),
);

/**
 * Lê a finalidade vigente para um atendimento — `null` quando ausente
 * ou expirada (TTL).
 */
export function getFinalidadeForAtendimento(
  atendimentoUuid: string,
): FinalidadeEntry | null {
  const entry = useFinalidadeStore.getState().entries[atendimentoUuid];
  if (!entry) return null;
  if (Date.now() - entry.setAtMs > FINALIDADE_TTL_MS) {
    return null;
  }
  return entry;
}
