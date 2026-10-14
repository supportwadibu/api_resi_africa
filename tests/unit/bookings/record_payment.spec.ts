import { test } from '@japa/runner'

import { buildPaymentPatch } from '#features/bookings/use_cases/record_booking_payment.use_case'
import { DomainError } from '#utils/domain_error'

test.group('buildPaymentPatch', () => {
  test('cumule le versement sur l’acompte', ({ assert }) => {
    const patch = buildPaymentPatch({ received_amount: 40000, deposit_amount: 10000 }, 15000)

    assert.equal(patch.deposit_amount, 25000)
  })

  test('ne touche jamais au prix du séjour', ({ assert }) => {
    // `received_amount` est le prix négocié : un versement le gonflait, et un
    // séjour à 60 000 F réglé en deux fois finissait à 120 000 F de CA.
    const patch = buildPaymentPatch({ received_amount: 40000, deposit_amount: 0 }, 15000)

    assert.notProperty(patch, 'received_amount')
    assert.notProperty(patch, 'total_amount')
    assert.notProperty(patch, 'discount_amount')
  })

  test('solde exactement le séjour', ({ assert }) => {
    const patch = buildPaymentPatch({ received_amount: 40000, deposit_amount: 25000 }, 15000)

    assert.equal(patch.deposit_amount, 40000)
  })

  test('refuse un versement au-delà du reste dû', ({ assert }) => {
    try {
      buildPaymentPatch({ received_amount: 40000, deposit_amount: 30000 }, 15000)
      assert.fail('un trop-perçu aurait dû être refusé')
    } catch (error) {
      assert.instanceOf(error, DomainError)
      assert.equal((error as DomainError).code, 'payment_exceeds_balance')
    }
  })

  test('une réservation ancienne lit son prix sur total_amount', ({ assert }) => {
    // Les documents antérieurs à la saisie comptoir ne portent ni
    // `received_amount` ni `deposit_amount`.
    const patch = buildPaymentPatch({ total_amount: 30000 }, 10000)

    assert.equal(patch.deposit_amount, 10000)
  })
})
