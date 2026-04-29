/**
 * Auth store — fonte da verdade do estado de autenticação no frontend.
 *
 * Decisões:
 *  - **Persistência em `sessionStorage`** (não `localStorage`).
 *    sessionStorage é por-aba e não sobrevive a fechamento da aba — mais
 *    seguro contra exfiltração via XSS de longa duração e alinhado a
 *    LGPD/RN-SEG (sessão clínica não deve permanecer aberta indefinidamente).
 *  - Tokens vivem APENAS aqui (e em sessionStorage). Não devem ser logados,
 *    nem aparecer em URLs, nem em mensagens de erro.
 *  - O hook `useAuth` retorna o slice imutável e ações; consumidores
 *    selecionam apenas o que precisam para evitar re-render em massa.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AuthenticatedUser } from '@/types/auth';

export interface AuthState {
  user: AuthenticatedUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  /** Indica que o usuário está num login parcial aguardando código MFA. */
  mfaPending: boolean;
}

export interface AuthActions {
  login: (input: {
    user: AuthenticatedUser;
    accessToken: string;
    refreshToken: string;
  }) => void;
  logout: () => void;
  setTokens: (tokens: { accessToken: string; refreshToken: string }) => void;
  setUser: (user: AuthenticatedUser) => void;
  setMfaPending: (pending: boolean) => void;
  /** Limpa apenas o estado em memória sem disparar efeitos externos. */
  reset: () => void;
}

export type AuthStore = AuthState & AuthActions;

const initialState: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  mfaPending: false,
};

const STORAGE_KEY = 'hms.auth.v1';

/**
 * `useAuthStore` — store zustand com persistência em sessionStorage.
 *
 * Para SSR/testes Node em que `sessionStorage` não existe, o middleware
 * `createJSONStorage` faz fallback para um stub no-op (vide getter abaixo).
 */
export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      ...initialState,
      login: ({ user, accessToken, refreshToken }) =>
        set({
          user,
          accessToken,
          refreshToken,
          isAuthenticated: true,
          mfaPending: false,
        }),
      logout: () => set({ ...initialState }),
      setTokens: ({ accessToken, refreshToken }) =>
        set({ accessToken, refreshToken }),
      setUser: (user) => set({ user, isAuthenticated: true }),
      setMfaPending: (mfaPending) => set({ mfaPending }),
      reset: () => set({ ...initialState }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          // Fallback no-op para ambientes sem `window` (testes Node puros).
          return {
            getItem: () => null,
            setItem: () => undefined,
            removeItem: () => undefined,
          };
        }
        return window.sessionStorage;
      }),
      // Não persistimos `mfaPending` (estado efêmero do fluxo de login).
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);

/**
 * Hook ergonômico para consumir o store em componentes.
 * Use seletores granulares para minimizar re-renders.
 */
export function useAuth(): AuthStore {
  return useAuthStore();
}

/**
 * Acesso fora de componentes (ex.: api-client interceptor).
 * Não use dentro de componentes — quebra a reatividade.
 */
export function getAuthSnapshot(): AuthState {
  return useAuthStore.getState();
}
