import vine from '@vinejs/vine'

import { EXPENSE_CATEGORIES } from '#models/expense'

/**
 * POST /proprio/expenses
 */
export const createExpenseValidator = vine.compile(
  vine.object({
    /**
     * Rattachement : un logement, ou la résidence pour une charge commune.
     *
     * Les deux sont optionnels ici, l'exclusivité étant une règle métier —
     * VineJS ne dirait pas *pourquoi* elle est violée, là où le use case
     * distingue « aucune cible » de « deux cibles ».
     */
    property_id: vine.string().trim().minLength(1).optional(),
    residence_id: vine.string().trim().minLength(1).optional(),
    category: vine.enum(EXPENSE_CATEGORIES),
    amount: vine.number().positive(),
    spent_at: vine.date(),
    note: vine.string().trim().maxLength(500).optional(),
  })
)

/**
 * PATCH /proprio/expenses/:id
 */
export const updateExpenseValidator = vine.compile(
  vine.object({
    // `nullable` : basculer une charge de bien vers une résidence suppose
    // d’effacer l’autre rattachement dans le même mouvement.
    property_id: vine.string().trim().minLength(1).nullable().optional(),
    residence_id: vine.string().trim().minLength(1).nullable().optional(),
    category: vine.enum(EXPENSE_CATEGORIES).optional(),
    amount: vine.number().positive().optional(),
    spent_at: vine.date().optional(),
    // `nullable` : une note vidée doit pouvoir être effacée, pas seulement
    // omise — omettre la clé laisse la note en place.
    note: vine.string().trim().maxLength(500).nullable().optional(),
  })
)

/**
 * GET /proprio/expenses et /proprio/expenses/summary
 */
export const listExpensesValidator = vine.compile(
  vine.object({
    property_id: vine.string().trim().optional(),
    residence_id: vine.string().trim().optional(),
    category: vine.enum(EXPENSE_CATEGORIES).optional(),
    from: vine.date().optional(),
    to: vine.date().optional(),
    page: vine.number().positive().withoutDecimals().optional(),
    per_page: vine.number().positive().withoutDecimals().max(100).optional(),
  })
)
