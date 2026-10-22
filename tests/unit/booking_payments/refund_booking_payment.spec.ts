import { test } from '@japa/runner'

import { RefundBookingPaymentUseCase } from '#features/booking_payments/use_cases/refund_booking_payment.use_case'
import { WaveApiError } from '#services/wave_client'

const payment = {
  id: 'pay-1',
  amount: 50000,
  provider_checkout_id: 'cos-1',
  status: 'success',
} as never

const booking = { id: 'b1', owner_id: 'o1', residence_id: 'r1' }

function useCase(refund: () => Promise<void>) {
  const updates: string[] = []
  const debits: Array<Record<string, unknown>> = []
  const refunds = new RefundBookingPaymentUseCase(
    {
      findSucceededByBooking: async () => payment,
      updateStatus: async (_id: string, status: string) => {
        updates.push(status)
        return null
      },
    } as never,
    { refundCheckoutSession: refund },
    {
      debitRefund: async (input: Record<string, unknown>) => {
        debits.push(input)
        return true
      },
    } as never
  )
  return { refunds, updates, debits }
}

test.group('RefundBookingPaymentUseCase', () => {
  test('rembourse par Wave, marque le paiement et débite le portefeuille', async ({ assert }) => {
    const { refunds, updates, debits } = useCase(async () => {})

    assert.equal(await refunds.execute(payment, booking), 50000)
    assert.deepEqual(updates, ['refunded'])
    assert.lengthOf(debits, 1)
    assert.equal(debits[0].wallet_id, 'residence_r1')
    assert.equal(debits[0].amount, 50000)
  })

  test('Wave refuse : rien n’est écrit, l’annulation échoue avec lui', async ({ assert }) => {
    const { refunds, updates, debits } = useCase(async () => {
      throw new WaveApiError(400, 'checkout-refund-failed', 'insufficient funds')
    })

    await assert.rejects(() => refunds.execute(payment, booking), /remboursement/)
    assert.lengthOf(updates, 0)
    assert.lengthOf(debits, 0)
  })
})
