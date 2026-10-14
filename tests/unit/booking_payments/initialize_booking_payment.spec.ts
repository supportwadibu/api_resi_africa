import { test } from '@japa/runner'

import { InitializeBookingPaymentUseCase } from '#features/booking_payments/use_cases/initialize_booking_payment.use_case'

const booking = { id: 'b1', client_id: 'c1', status: 'confirmed', total_amount: 80000 }

test.group('InitializeBookingPaymentUseCase — réservation déjà payée', () => {
  test('refuse un nouveau paiement si un paiement a réussi', async ({ assert }) => {
    let checkouts = 0
    const init = new InitializeBookingPaymentUseCase(
      { findById: async () => booking } as never,
      {
        findLatestByBooking: async () => ({ status: 'success', payment_url: 'https://x' }),
        findPendingByBooking: async () => null,
      } as never,
      {
        createCheckoutSession: async () => {
          checkouts++
          return { id: 'cos', paymentUrl: 'https://pay', raw: {} }
        },
      } as never
    )

    await assert.rejects(() => init.execute('b1', 'c1'), 'Cette réservation est déjà payée.')
    assert.equal(checkouts, 0)
  })
})
