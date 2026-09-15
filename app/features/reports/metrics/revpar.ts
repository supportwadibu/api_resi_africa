/**
 * Revenu moyen par jour disponible.
 *
 * Distinct du prix moyen pratiqué : le RevPAR rapporte le revenu à **tous**
 * les jours du parc, occupés ou non. Un bien loué cher mais vide la moitié du
 * temps y apparaît pour ce qu'il rapporte réellement.
 *
 * Le zéro sur un dénominateur nul n'est pas un repli défensif mais la seule
 * réponse lisible : un parc sans jour disponible ne rapporte rien par jour, et
 * `Infinity` traverserait le PDF jusqu'à s'afficher tel quel.
 */
export function computeRevpar(grossRevenue: number, availableDays: number): number {
  if (availableDays <= 0) return 0

  return Math.round(grossRevenue / availableDays)
}
