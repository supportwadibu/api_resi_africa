import type { ExpenseCategory } from '#models/expense'

export interface ExpenseDto {
  id: string
  owner_id: string
  /** Bien concerné, `null` pour une charge commune de résidence. */
  property_id: string | null
  /** Résidence concernée, `null` pour une charge de bien. */
  residence_id: string | null
  category: ExpenseCategory
  amount: number
  spent_at: Date
  note: string | null
  created_at: Date
  updated_at: Date
  /**
   * Résumé du bien concerné.
   *
   * Joint à la liste : sans lui, l'application n'aurait qu'un identifiant à
   * afficher et devrait relancer une requête par dépense. `null` si le bien a
   * été supprimé depuis.
   */
  property?: ExpensePropertySummary | null
  /** Résumé de la résidence, pour une charge commune. */
  residence?: ExpenseResidenceSummary | null
}

export interface ExpensePropertySummary {
  id: string
  title: string
  city: string
}

/** Résumé de la résidence concernée, joint comme celui du bien. */
export interface ExpenseResidenceSummary {
  id: string
  name: string
  city: string
}

export interface CreateExpenseInput {
  owner_id: string
  /** Exactement un des deux rattachements doit être fourni. */
  property_id?: string | null
  residence_id?: string | null
  category: ExpenseCategory
  amount: number
  spent_at: Date
  note?: string | null
  /**
   * Acteur ayant saisi la dépense — un gérant —, `null` ou absent pour le
   * propriétaire. Posé par le contrôleur depuis `ctx.scope`, jamais par le
   * client. Donnée d'audit, n'entrant dans aucun calcul.
   */
  created_by?: string | null
}

export interface UpdateExpenseInput {
  property_id?: string | null
  residence_id?: string | null
  category?: ExpenseCategory
  amount?: number
  spent_at?: Date
  note?: string | null
}

export interface ListExpensesFilters {
  owner_id?: string
  property_id?: string
  residence_id?: string
  category?: ExpenseCategory
  from?: Date
  to?: Date
  page?: number
  per_page?: number
  /**
   * Logements du périmètre de l'appelant. `null` ou absent = aucune
   * restriction. Alimenté par le middleware `scope()`, jamais par le client.
   */
  scope_property_ids?: string[] | null
}

export interface ListExpensesOutput {
  data: ExpenseDto[]
  meta: {
    total: number
    perPage: number
    currentPage: number
    lastPage: number
  }
}

export interface ExpenseCategoryBreakdownDto {
  category: ExpenseCategory
  amount: number
  count: number
  /** Part du total, en pourcentage arrondi — de quoi tracer un anneau. */
  share_percent: number
}

export interface ExpenseSummaryDto {
  total: number
  count: number
  by_category: ExpenseCategoryBreakdownDto[]
}
