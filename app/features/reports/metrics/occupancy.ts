/**
 * Taux d'occupation d'un parc sur une fenêtre.
 *
 * Le numérateur (`occupiedDays`) est un cumul de **jours-bien** — la somme des
 * jours occupés sur tous les biens exploités, pas sur un seul. Le dénominateur
 * doit donc être une **capacité**, jours calendaires multipliés par le nombre
 * de biens, jamais les seuls jours calendaires : les diviser directement
 * gonfle le taux d'un facteur égal au nombre de biens exploités, un bug resté
 * invisible sur un propriétaire mono-bien (le facteur vaut alors 1) et qui ne
 * se révèle que sur un parc de plusieurs biens.
 *
 * Plafonné à 1, comme `FinanceRepository.occupancyRate` : un séjour débordant
 * la fenêtre peut pousser le numérateur au-delà de la capacité, et le rapport
 * performance doit produire le même taux que l'écran Finance sur la même
 * période — jamais un chiffre que l'écran ne peut pas reproduire.
 */
export function occupancyRatio(occupiedDays: number, availableDays: number): number {
  if (availableDays <= 0) return 0

  return Math.min(1, occupiedDays / availableDays)
}
