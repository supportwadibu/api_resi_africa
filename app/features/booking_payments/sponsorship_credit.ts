/**
 * Part d'un paiement de réservation réglée par le crédit parrainage du client,
 * figée sur le paiement à son ouverture.
 *
 * Absente des paiements antérieurs au parrainage et de ceux sans crédit : 0.
 * Le portefeuille du propriétaire en est crédité en plus de ce que Wave a
 * encaissé, et débité d'autant au remboursement.
 */
export function sponsorshipCreditOf(payment: { metadata?: Record<string, unknown> }): number {
  const value = payment.metadata?.sponsorship_credit_amount
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

/**
 * Ce qui revient au propriétaire sur un paiement de réservation : sa part
 * figée à l'ouverture du paiement quand RESI prend une commission, tout
 * l'encaissement — crédit parrainage compris — sinon, comme avant la
 * commission. Ce que RESI garde est l'écart entre les deux.
 */
export function ownerAmountOf(payment: {
  amount: number
  metadata?: Record<string, unknown>
}): number {
  const value = payment.metadata?.owner_amount
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : payment.amount + sponsorshipCreditOf(payment)
}

/**
 * Commission de RESI sur un paiement de réservation : ce que le client a
 * réglé — Wave et crédit parrainage — moins la part du propriétaire. 0 sur un
 * paiement sans commission, et jamais négatif : un code promo plus généreux
 * que la commission ne fait pas devoir de gain au parrain.
 */
export function commissionOfPayment(payment: {
  amount: number
  metadata?: Record<string, unknown>
}): number {
  return Math.max(0, payment.amount + sponsorshipCreditOf(payment) - ownerAmountOf(payment))
}

/**
 * Paiement d'un acompte : crédité bloqué au portefeuille, débloqué à l'arrivée.
 * Absent de l'historique et du paiement total.
 */
export function isDepositPayment(payment: { metadata?: Record<string, unknown> }): boolean {
  return payment.metadata?.deposit === true
}
