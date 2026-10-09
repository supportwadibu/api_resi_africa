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
  booking?: { client_id: string } | null
  payment?: Record<string, unknown> | null
  session?: Record<string, unknown> | null
}) {
  const updates: Array<{ status: string; data: Record<string, unknown> }> = []
  const confirm = new ConfirmBookingPaymentUseCase(
    {
      findById: async () => (options.booking === undefined ? { client_id: 'c1' } : options.booking),
    } as never,
    {
      findLatestByBooking: async () => (options.payment === undefined ? pending : options.payment),
      updateStatus: async (_id: string, status: string, data: Record<string, unknown>) => {
        updates.push({ status, data })
        return { ...pending, status }
      },
    } as never,
    { getCheckoutSession: async () => options.session ?? null } as never
  )
  return { confirm, updates }
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

  test('montant divergent : échec, jamais succès', async ({ assert }) => {
    const { confirm, updates } = useCase({ session: { ...paid, amount: '1000' } })
    const payment = await confirm.execute('b1', 'c1')

    assert.equal(payment.status, 'failed')
    assert.equal(updates[0].data.failure_reason, 'amount_mismatch')
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
})
