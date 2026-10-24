/**
 * Durée moyenne d'un séjour sur une fenêtre, en jours.
 *
 * Même définition que `moyen_sejour` de `FinanceRepository.overview` : le total
 * des jours-bien occupés — pondérés par type de séjour et **bornés à la
 * fenêtre** — divisé par la part des réservations tombant dans la fenêtre
 * (`sumBookingShares`). La moyenne des `days_count` bruts en diffère : une
 * demi-journée y compterait pour un jour plein.
 *
 * Le dénominateur est une part et non un nombre de réservations : un séjour à
 * cheval sur la borne n'apporte qu'une partie de ses jours, et le compter pour
 * une réservation entière tirait la moyenne vers le bas — un séjour de 3 jours
 * coupé en 1 + 2 donnait 1 j puis 2 j.
 *
 * Le bilan financier et le rapport performance, édités le même jour sur la même
 * période, afficheraient sinon deux « séjour moyen » contradictoires.
 *
 * Le quotient n'est pas arrondi ici : c'est le rendu qui décide de sa
 * précision d'affichage (`formatDays`), et arrondir en amont ferait diverger ce
 * chiffre de celui que l'écran Finance calcule sur les mêmes réservations.
 */
export function averageStay(occupiedDays: number, bookedShare: number): number {
  if (!(bookedShare > 0)) return 0

  return occupiedDays / bookedShare
}
