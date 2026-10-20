import { buildPaginationMeta } from '#features/feedbacks/use_cases/pagination'

/** Fenêtre Firestore d'une page, aux mêmes bornes que le bloc `meta`. */
export function pageWindow(input: { page?: number; per_page?: number }) {
  const meta = buildPaginationMeta(0, input)
  return { limit: meta.perPage, offset: (meta.currentPage - 1) * meta.perPage }
}
