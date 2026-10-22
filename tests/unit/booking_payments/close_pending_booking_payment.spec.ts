import { test } from '@japa/runner'

import { ClosePendingBookingPaymentUseCase } from '#features/booking_payments/use_cases/close_pending_booking_payment.use_case'

const pending = { id: 'pay-1', status: 'pending', provider_checkout_id: 'cos-1' }

function useCase(options: { pending?: Record<string, unknown>[]; expireRefused?: boolean }) {
  const statuses: string[] = []
  const expired: string[] = []
  let confirmations = 0

  const close = new ClosePendingBookingPaymentUseCase(
    {
      findAllPendingByBooking: async () => options.pending ?? [pending],
      updateStatus: async (_id: string, status: string) => {
        statuses.push(status)
        return null
      },
    } as never,
    {
      expireCheckoutSession: async (id: string) => {
        expired.push(id)
        return !options.expireRefused
      },
    } as never,
    {
      executeForBooking: async () => {
        confirmations++
        return null
      },
    } as never
  )

  return { close, statuses, expired, confirmations: () => confirmations }
}

test.group('ClosePendingBookingPaymentUseCase', () => {
  test('ferme la session ouverte d’une réservation qu’on annule', async ({ assert }) => {
    // Restée ouverte, elle laissait le client payer une réservation annulée.
    const { close, statuses, expired } = useCase({})
    await close.execute('b1')

    assert.deepEqual(expired, ['cos-1'])
    assert.deepEqual(statuses, ['cancelled'])
  })

  test('fermeture refusée : l’issue est constatée, pas écrasée', async ({ assert }) => {
    // 409 : payée à l'instant. La confirmation la constate, et l'annulation
    // qui suit trouve un paiement réussi à garder ou rendre.
    const { close, statuses, confirmations } = useCase({ expireRefused: true })
    await close.execute('b1')

    assert.lengthOf(statuses, 0)
    assert.equal(confirmations(), 1)
  })

  test('ferme chaque session ouverte, double appui compris', async ({ assert }) => {
    const { close, statuses, expired } = useCase({
      pending: [pending, { ...pending, id: 'pay-2', provider_checkout_id: 'cos-2' }],
    })
    await close.execute('b1')

    assert.deepEqual(expired, ['cos-1', 'cos-2'])
    assert.deepEqual(statuses, ['cancelled', 'cancelled'])
  })

  test('aucun paiement en attente : rien à fermer', async ({ assert }) => {
    const { close, expired, statuses } = useCase({ pending: [] })
    await close.execute('b1')

    assert.lengthOf(expired, 0)
    assert.lengthOf(statuses, 0)
  })
})
