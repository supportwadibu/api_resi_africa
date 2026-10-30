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
