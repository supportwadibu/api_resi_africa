import type { PaginationMeta } from '../dto/feedback.dto.ts'

/**
 * Bornes de pagination, identiques à celles appliquées par le repository.
 *
 * Les deux listes — celle de l'auteur et celle de l'équipe — produisent le même
 * bloc `meta` ; le calculer ici évite que l'une des deux dérive de l'autre.
 */
export function buildPaginationMeta(
  total: number,
  input: { page?: number; per_page?: number }
): PaginationMeta {
  const currentPage = Math.max(1, input.page ?? 1)
  const perPage = Math.min(100, Math.max(1, input.per_page ?? 20))

  return {
    total,
    perPage,
    currentPage,
    lastPage: Math.max(1, Math.ceil(total / perPage)),
  }
}
