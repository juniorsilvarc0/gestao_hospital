/**
 * Tipos comuns aos endpoints de estrutura física (paginação, helpers
 * de conversão BigInt ↔ string).
 */
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Converte string numérica em BigInt validando faixa positiva. Lança
 * erro genérico — chamadores devem traduzir para HTTP apropriado.
 */
export function toBigInt(raw: string): bigint {
  if (!/^\d+$/.test(raw)) {
    throw new Error(`Identificador inválido: ${raw}`);
  }
  const value = BigInt(raw);
  if (value <= 0n) {
    throw new Error(`Identificador inválido: ${raw}`);
  }
  return value;
}

export function paginate<T, U>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
  map: (item: T) => U,
): PaginatedResponse<U> {
  return {
    data: items.map(map),
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}
