/**
 * Périmètre d'une résidence : ses charges communes et celles de ses unités.
 *
 * Une résidence n'a pas un seul jeu de dépenses mais deux, qui vivent sur des
 * champs différents — `residence_id` pour l'électricité commune, `property_id`
 * pour la réparation d'un studio. Le relevé d'une résidence est la somme des
 * deux, et c'est le seul endroit du code où ils se rencontrent.
 *
 * Voir `docs/specs/residences-design.md`.
 */

export interface ScopedExpense {
  property_id?: string | null
  residence_id?: string | null
  amount: number
}

/**
 * Une dépense entre-t-elle dans le relevé de cette résidence ?
 *
 * Deux cas, et un seul peut s'appliquer à la fois — la règle d'exclusivité de
 * `resolveExpenseTarget` le garantit à l'écriture :
 *
 * - charge commune, portée par `residence_id` ;
 * - charge d'une unité de cette résidence, portée par `property_id`.
 *
 * Le test sur `residence_id` vient en premier : une charge commune ne porte pas
 * de `property_id`, et l'ordre inverse ferait dépendre le résultat d'un champ
 * absent.
 */
export function belongsToResidence(
  expense: ScopedExpense,
  residenceId: string,
  unitIds: ReadonlySet<string>
): boolean {
  if (expense.residence_id) {
    return expense.residence_id === residenceId
  }

  if (expense.property_id) {
    return unitIds.has(expense.property_id)
  }

  // Une dépense sans cible n'appartient à aucun relevé. Elle ne devrait pas
  // exister, mais l'historique antérieur à la règle d'exclusivité peut en
  // porter, et la compter ici gonflerait les charges d'une résidence au hasard.
  return false
}

/**
 * Total des charges d'une résidence sur un lot de dépenses déjà filtré par
 * période.
 *
 * Le double comptage est impossible par construction : chaque dépense est
 * évaluée une fois, et `belongsToResidence` la classe soit en charge commune,
 * soit en charge d'unité, jamais les deux.
 */
export function sumResidenceExpenses(
  expenses: readonly ScopedExpense[],
  residenceId: string,
  unitIds: ReadonlySet<string>
): number {
  return expenses.reduce(
    (sum, expense) =>
      belongsToResidence(expense, residenceId, unitIds) ? sum + expense.amount : sum,
    0
  )
}
