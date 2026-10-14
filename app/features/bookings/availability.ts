/**
 * Disponibilité d'un bien, déduite des dates plutôt que d'un statut.
 *
 * Le bien portait auparavant `status: 'reserved'` dès la première réservation.
 * Trois défauts : une réservation pour dans trois mois rendait le bien
 * invendable immédiatement ; aucun flux ne le remettait en `published`, ni
 * l'annulation ni la fin du séjour, si bien qu'il restait bloqué
 * indéfiniment ; et deux séjours disjoints s'excluaient mutuellement.
 *
 * Déduire la disponibilité des dates supprime les trois : le bien se libère de
 * lui-même, sans état à remettre à zéro ni tâche planifiée.
 */

/** Statuts qui immobilisent le bien. Les autres laissent la période libre. */
export const ACTIVE_BOOKING_STATUSES = ['confirmed', 'in_progress'] as const

export interface BookedPeriod {
  check_in_at: Date
  check_out_at: Date
  status: string
}

/**
 * Réservations lues en base ramenées à leur période d'immobilisation.
 *
 * Le repli sur `start_date` / `end_date` n'est pas décoratif : les
 * réservations en ligne et celles antérieures à ce chantier ne portent pas
 * `check_in_at` / `check_out_at`, et les ignorer laisserait une réservation
 * comptoir se poser sur un séjour déjà payé.
 */
export function toPeriods<T extends { _id?: string }>(
  docs: Array<
    T & {
      check_in_at?: Date
      check_out_at?: Date
      start_date: Date
      end_date: Date
      status: string
    }
  >
): Array<BookedPeriod & { _id?: string }> {
  return docs.map((doc) => ({
    // L'identifiant est conservé : la prolongation doit pouvoir s'exclure
    // elle-même du contrôle de chevauchement, ce qu'une comparaison par dates
    // ne permet pas de faire sûrement.
    _id: doc._id,
    check_in_at: doc.check_in_at ?? doc.start_date,
    check_out_at: doc.check_out_at ?? doc.end_date,
    status: doc.status,
  }))
}

/**
 * Deux périodes se chevauchent-elles ?
 *
 * Bornes strictes : une sortie à 12h et une entrée à 12h le même jour ne se
 * chevauchent pas. C'est ce qui rend possible l'enchaînement de deux séjours
 * dans la même journée, la règle du bien étant 12h → 12h.
 */
export function periodsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime()
}

/**
 * Première réservation active chevauchant la période demandée, s'il y en a une.
 *
 * Retourne la réservation plutôt qu'un booléen : l'appelant doit pouvoir dire
 * au propriétaire *quelle* réservation bloque, un simple refus étant
 * inexploitable pour résoudre un conflit de synchronisation.
 */
export function findOverlappingPeriod<T extends BookedPeriod>(
  candidate: { check_in_at: Date; check_out_at: Date },
  existing: T[]
): T | null {
  const blocking = ACTIVE_BOOKING_STATUSES as readonly string[]

  for (const period of existing) {
    if (!blocking.includes(period.status)) continue

    if (
      periodsOverlap(
        candidate.check_in_at,
        candidate.check_out_at,
        period.check_in_at,
        period.check_out_at
      )
    ) {
      return period
    }
  }

  return null
}

/**
 * La prolongation d'un séjour tient-elle sans empiéter sur une autre ?
 *
 * Une prolongation ne déplace que la borne de sortie : la période à contrôler
 * est le seul segment gagné, de l'ancienne sortie à la nouvelle. Contrôler le
 * séjour entier ferait qu'il se heurterait à lui-même.
 *
 * La réservation prolongée est écartée par son identifiant et non par ses
 * dates : deux réservations du même client sur le même bien peuvent partager
 * une borne, et les comparer par dates en exclurait une de trop.
 */
export function findExtensionConflict<T extends BookedPeriod & { _id?: string; id?: string }>(
  bookingId: string,
  currentCheckOut: Date,
  newCheckOut: Date,
  existing: T[]
): T | null {
  const others = existing.filter((p) => (p._id ?? p.id) !== bookingId)

  return findOverlappingPeriod({ check_in_at: currentCheckOut, check_out_at: newCheckOut }, others)
}
