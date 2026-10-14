import { test } from '@japa/runner'

import { extractCheckoutId } from '#features/booking_payments/wave_webhook'

test.group('extractCheckoutId', () => {
  test('lit l’identifiant de session aux emplacements connus', ({ assert }) => {
    assert.equal(extractCheckoutId({ data: { id: 'cos-1' } }), 'cos-1')
    assert.equal(extractCheckoutId({ checkout_session_id: 'cos-2' }), 'cos-2')
  })

  test('null quand le corps n’en porte pas', ({ assert }) => {
    assert.isNull(extractCheckoutId({ type: 'checkout.session.completed' }))
  })
})
