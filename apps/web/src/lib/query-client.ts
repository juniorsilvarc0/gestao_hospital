import { QueryClient } from '@tanstack/react-query';

/**
 * Configuração padrão do React Query.
 *  - `retry: 1` evita marteladas em endpoints sob falha transitória sem mascarar bugs.
 *  - `staleTime: 30s` cobre a maioria dos dados quentes (mapa de leitos, fila etc.)
 *    sem perder consistência percebida; telas críticas redefinem para 0 quando preciso.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
