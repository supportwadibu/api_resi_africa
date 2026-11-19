import { test } from '@japa/runner'

import { otpDelivery } from '#auth/helpers/password_reset'
import { assertValidSecret, isWeakPin, secretKindFor } from '#auth/helpers/pin_rules'

test.group('code à 5 chiffres du client', () => {
  test('seul le client se connecte avec un code', ({ assert }) => {
    assert.equal(secretKindFor('client'), 'pin')
    assert.equal(secretKindFor('proprio'), 'password')
    assert.equal(secretKindFor('gerant'), 'password')
  })

  test('accepte cinq chiffres, refuse le reste', ({ assert }) => {
    assert.doesNotThrow(() => assertValidSecret('client', '48271'))
    assert.throws(() => assertValidSecret('client', '4827'), /5 chiffres/)
    assert.throws(() => assertValidSecret('client', '48a71'), /5 chiffres/)
    assert.throws(() => assertValidSecret('client', 'motdepasse'), /5 chiffres/)
  })

  test('refuse les codes que l’on devine en premier', ({ assert }) => {
    for (const pin of ['00000', '77777', '12345', '56789', '98765', '43210']) {
      assert.isTrue(isWeakPin(pin), pin)
    }
    assert.isFalse(isWeakPin('48271'))
    assert.throws(() => assertValidSecret('client', '12345'), /trop facile/)
  })

  test('garde un mot de passe de 8 caractères aux autres rôles', ({ assert }) => {
    assert.throws(() => assertValidSecret('proprio', '48271'), /8 caractères/)
    assert.doesNotThrow(() => assertValidSecret('proprio', 'un-long-secret'))
  })
})

test.group('canal des codes', () => {
  const typed = { channel: 'phone' as const, target: '+2250700000000' }

  test('un client inscrit par e-mail reçoit ses codes par e-mail', ({ assert }) => {
    assert.deepEqual(
      otpDelivery({ auth_channel: 'email', email: 'awa@example.com' }, 'client', typed),
      { channel: 'email', target: 'awa@example.com' }
    )
  })

  test('les autres comptes gardent le canal saisi', ({ assert }) => {
    assert.deepEqual(otpDelivery({ auth_channel: 'phone', email: null }, 'client', typed), typed)
    assert.deepEqual(
      otpDelivery({ auth_channel: 'email', email: 'gerant@example.com' }, 'gerant', typed),
      typed
    )
  })
})
