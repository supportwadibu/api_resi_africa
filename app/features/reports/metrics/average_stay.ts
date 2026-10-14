/**
 * Durée moyenne d'un séjour sur une fenêtre, en jours.
 *
 * Même définition que `moyen_sejour` de `FinanceRepository.overview` : le total
 * des jours-bien occupés — pondérés par type de séjour et **bornés à la
 * fenêtre** — divisé par le nombre de réservations. La moyenne des `days_count`
 * bruts en diffère sur deux points, et les deux comptent : un séjour à cheval
 * sur la borne apporterait sa durée entière à une période qui n'en porte qu'une
 * partie, et une demi-journée compterait pour un jour plein.
 *
 * Le bilan financier et le rapport performance, édités le même jour sur la même
 * période, afficheraient sinon deux « séjour moyen » contradictoires.
 *
 * Le quotient n'est pas arrondi ici : c'est le rendu qui décide de sa
 * précision d'affichage (`formatDays`), et arrondir en amont ferait diverger ce
 * chiffre de celui que l'écran Finance calcule sur les mêmes réservations.
 */
export function averageStay(occupiedDays: number, bookingsCount: number): number {
  if (bookingsCount <= 0) return 0

  return occupiedDays / bookingsCount
}
