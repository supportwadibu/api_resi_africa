import { test } from '@japa/runner'

import { ConfirmBookingPaymentUseCase } from '#features/booking_payments/use_cases/confirm_booking_payment.use_case'

const pending = {
  id: 'BOOKING-b1-uuid',
  booking_id: 'b1',
  client_id: 'c1',
  amount: 80000,
  currency: 'XOF',
  status: 'pending',
  provider_checkout_id: 'cos-1',
  transaction_reference: 'BOOKING-b1-uuid',
}

function useCase(options: {
  booking?: { client_id: string; status?: string } | null
  payment?: Record<string, unknown> | null
  session?: Record<string, unknown> | null
  /** Autre paiement déjà réussi pour la même réservation. */
  otherPaid?: Record<string, unknown> | null
  refundFails?: boolean
}) {
  const updates: Array<{ status: string; data: Record<string, unknown> }> = []
  const credits: Array<Record<string, unknown>> = []
  const refunds: string[] = []
  const confirm = new ConfirmBookingPaymentUseCase(
    {
      findById: async () =>
        options.booking === undefined
          ? { client_id: 'c1', residence_id: 'r1', status: 'confirmed' }
          : options.booking,
    } as never,
    {
      findLatestByBooking: async () => (options.payment === undefined ? pending : options.payment),
      findByProviderCheckoutId: async () =>
        options.payment === undefined ? pending : options.payment,
      findSucceededByBooking: async () => options.otherPaid ?? null,
      updateStatus: async (_id: string, status: string, data: Record<string, unknown>) => {
        updates.push({ status, data })
        return { ...pending, status }
      },
    } as never,
    {
      getCheckoutSession: async () => options.session ?? null,
      refundCheckoutSession: async (id: string) => {
        if (options.refundFails) throw new Error('checkout-refund-failed')
        refunds.push(id)
      },
    } as never,
    { execute: async (input: Record<string, unknown>) => void credits.push(input) } as never
  )
  return { confirm, updates, credits, refunds }
}

const paid = {
  id: 'cos-1',
  amount: '80000',
  currency: 'XOF',
  checkout_status: 'complete',
  payment_status: 'succeeded',
  client_reference: 'BOOKING-b1-uuid',
  transaction_id: 'T-1',
}

test.group('ConfirmBookingPaymentUseCase', () => {
  test('constate un paiement réussi', async ({ assert }) => {
    const { confirm, updates } = useCase({ session: paid })
    const payment = await confirm.execute('b1', 'c1')

    assert.equal(payment.status, 'success')
    assert.equal(updates[0].status, 'success')
    assert.equal(updates[0].data.provider_transaction_id, 'T-1')
  })

  test('un paiement réussi crédite le portefeuille de la résidence', async ({ assert }) => {
    const { confirm, credits } = useCase({ session: paid })
    await confirm.execute('b1', 'c1')

    assert.lengthOf(credits, 1)
    assert.equal(credits[0].residence_id, 'r1')
    assert.equal(credits[0].amount, 80000)
    assert.equal(credits[0].booking_payment_id, 'BOOKING-b1-uuid')
  })

  test('un paiement en échec ne crédite rien', async ({ assert }) => {
    const { confirm, credits } = useCase({ session: { ...paid, amount: '1000' } })
    await confirm.execute('b1', 'c1')
    assert.lengthOf(credits, 0)
  })

  test('montant divergent : échec, jamais succès', async ({ assert }) => {
    const { confirm, updates } = useCase({ session: { ...paid, amount: '1000' } })
    const payment = await confirm.execute('b1', 'c1')

    assert.equal(payment.status, 'failed')
    assert.equal(updates[0].data.failure_reason, 'amount_mismatch')
    // Gardé pour pouvoir rembourser le client.
    assert.equal(updates[0].data.provider_transaction_id, 'T-1')
  })

  test('session expirée : paiement expiré', async ({ assert }) => {
    const { confirm } = useCase({
      session: { ...paid, checkout_status: 'expired', payment_status: 'processing' },
    })
    const payment = await confirm.execute('b1', 'c1')
    assert.equal(payment.status, 'expired')
  })

  test('session encore ouverte : rien ne change', async ({ assert }) => {
    const { confirm, updates } = useCase({
      session: { ...paid, checkout_status: 'open', payment_status: 'processing' },
    })
    const payment = await confirm.execute('b1', 'c1')
    assert.equal(payment.status, 'pending')
    assert.lengthOf(updates, 0)
  })

  test('réservation d’un autre client : 404', async ({ assert }) => {
    const { confirm } = useCase({ booking: { client_id: 'autre' } })
    await assert.rejects(() => confirm.execute('b1', 'c1'), 'Réservation introuvable.')
  })

  test('paiement déjà constaté : rendu tel quel, sans relire Wave', async ({ assert }) => {
    // Le webhook ou la page de retour de Wave passent souvent avant le retour
    // dans l'app : la confirmation doit alors dire « payé », pas « introuvable ».
    const { confirm, updates } = useCase({
      payment: { ...pending, status: 'success' },
      session: { ...paid, payment_status: 'processing' },
    })
    const payment = await confirm.execute('b1', 'c1')

    assert.equal(payment.status, 'success')
    assert.lengthOf(updates, 0)
  })

  test('aucun paiement lancé : 404', async ({ assert }) => {
    const { confirm } = useCase({ payment: null })
    await assert.rejects(() => confirm.execute('b1', 'c1'), 'Paiement introuvable.')
  })

  test('paiement annulé chez Wave : enregistré annulé, pas expiré', async ({ assert }) => {
    const { confirm, updates } = useCase({
      session: { ...paid, checkout_status: 'complete', payment_status: 'cancelled' },
    })
    const payment = await confirm.execute('b1', 'c1')

    assert.equal(payment.status, 'cancelled')
    assert.equal(updates[0].status, 'cancelled')
  })

  test('webhook : relit la session, montant divergent jamais payé', async ({ assert }) => {
    const { confirm } = useCase({ session: { ...paid, amount: '1000' } })
    const payment = await confirm.executeForCheckout('cos-1')

    assert.equal(payment?.status, 'failed')
  })

  test('webhook d’une session inconnue : ignoré', async ({ assert }) => {
    const { confirm } = useCase({ payment: null })
    assert.isNull(await confirm.executeForCheckout('cos-x'))
  })

  test('payé après l’annulation : rendu au client, jamais crédité', async ({ assert }) => {
    // Le client a payé sur une session encore ouverte alors que la réservation
    // venait d'être annulée : l'argent n'est dû à personne d'autre que lui.
    const { confirm, updates, credits, refunds } = useCase({
      booking: { client_id: 'c1', status: 'cancelled' },
      session: paid,
    })
    const payment = await confirm.executeForCheckout('cos-1')

    assert.equal(payment?.status, 'refunded')
    assert.deepEqual(refunds, ['cos-1'])
    assert.lengthOf(credits, 0)
    assert.equal(updates.at(-1)?.data.failure_reason, 'booking_cancelled')
  })

  test('second paiement d’une réservation déjà payée : rendu au client', async ({ assert }) => {
    // Deux sessions ouvertes par un double appui, payées toutes deux : la
    // seconde est remboursée, la réservation n'est payée qu'une fois.
    const { confirm, credits, refunds, updates } = useCase({
      session: paid,
      otherPaid: { ...pending, id: 'BOOKING-b1-autre', status: 'success' },
    })
    const payment = await confirm.executeForCheckout('cos-1')

    assert.equal(payment?.status, 'refunded')
    assert.deepEqual(refunds, ['cos-1'])
    assert.lengthOf(credits, 0)
    assert.equal(updates.at(-1)?.data.failure_reason, 'duplicate_payment')
  })

  test('le paiement lui-même ne compte pas comme doublon', async ({ assert }) => {
    // Deux confirmations simultanées du même paiement : la seconde le voit déjà
    // réussi, ce n'est pas un second paiement.
    const { confirm, credits, refunds } = useCase({
      session: paid,
      otherPaid: { ...pending, status: 'success' },
    })
    const payment = await confirm.executeForCheckout('cos-1')

    assert.equal(payment?.status, 'success')
    assert.lengthOf(refunds, 0)
    assert.lengthOf(credits, 1)
  })

  test('remboursement refusé : en attente, l’erreur remonte pour rejouer', async ({ assert }) => {
    // Le webhook répond alors en erreur : Wave le rejoue jusqu'à trois jours,
    // et chaque rejeu retente le remboursement.
    const { confirm, updates, credits } = useCase({
      booking: { client_id: 'c1', status: 'cancelled' },
      session: paid,
      refundFails: true,
    })

    await assert.rejects(() => confirm.executeForCheckout('cos-1'))
    assert.lengthOf(updates, 0)
    assert.lengthOf(credits, 0)
  })
})
