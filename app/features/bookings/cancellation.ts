import { DomainError } from '#utils/domain_error'

/**
 * Sort de l'acompte d'une réservation annulée.
 *
 * `keep` : le propriétaire le garde — dédommagement d'une annulation tardive ;
 * la somme reste un revenu. `refund` : il le rend au client.
 */
export const DEPOSIT_ACTIONS = ['keep', 'refund'] as const
export type DepositAction = (typeof DEPOSIT_ACTIONS)[number]

export interface CancellationPatch {
  status: 'cancelled'
  cancelled_at: Date
  cancellation_reason: string | null
  cancellation_deposit_action: DepositAction | null
  retained_amount: number
  cancellation_refunded_amount: number
}

/**
 * Patch d'annulation d'une réservation, côté propriétaire ou gérant.
 *
 * Le sort de l'acompte est exigé dès qu'un acompte a été versé : le deviner
 * ferait disparaître du chiffre d'affaires une somme gardée, ou y laisserait
 * une somme rendue. Sans acompte, la question n'a pas d'objet et le choix est
 * ignoré.
 *
 * Un séjour déjà clôturé n'est pas annulable : son revenu est constaté, et
 * revenir dessus réécrirait un mois clos — le correctif est un avoir.
 */
export function buildCancellationPatch(
  booking: { status: string; deposit_amount?: number },
  input: { reason?: string | null; deposit_action?: DepositAction | null },
  now: Date = new Date()
): CancellationPatch {
  if (booking.status === 'cancelled') {
    throw new DomainError('booking_already_cancelled', 'Réservation déjà annulée.', 409)
  }

  if (booking.status === 'completed') {
    throw new DomainError(
      'booking_already_completed',
      'Séjour déjà clôturé : il ne peut plus être annulé.',
      409
    )
  }

  // Absent de l'historique : aucun acompte n'y était saisi.
  const deposit = booking.deposit_amount ?? 0
  const action = deposit > 0 ? (input.deposit_action ?? null) : null

  if (deposit > 0 && !action) {
    throw new DomainError(
      'deposit_action_required',
      "Un acompte a été versé : indiquez s'il est gardé ou remboursé.",
      422
    )
  }

  return {
    status: 'cancelled',
    cancelled_at: now,
    cancellation_reason: input.reason ?? null,
    cancellation_deposit_action: action,
    retained_amount: action === 'keep' ? deposit : 0,
    cancellation_refunded_amount: action === 'refund' ? deposit : 0,
  }
}
