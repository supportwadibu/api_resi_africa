import { test } from '@japa/runner'

import { otpDelivery } from '#auth/helpers/password_reset'
import { assertValidSecret, isWeakPin, secretKindFor } from '#auth/helpers/pin_rules'

test.group('code à 4 chiffres du client', () => {
  test('seul le client se connecte avec un code', ({ assert }) => {
    assert.equal(secretKindFor('client'), 'pin')
    assert.equal(secretKindFor('proprio'), 'password')
    assert.equal(secretKindFor('gerant'), 'password')
  })

  test('accepte quatre chiffres, refuse le reste', ({ assert }) => {
    assert.doesNotThrow(() => assertValidSecret('client', '4827'))
    assert.throws(() => assertValidSecret('client', '482'), /4 chiffres/)
    assert.throws(() => assertValidSecret('client', '48a7'), /4 chiffres/)
    assert.throws(() => assertValidSecret('client', 'motdepasse'), /4 chiffres/)
  })

  test('refuse les codes que l’on devine en premier', ({ assert }) => {
    for (const pin of ['0000', '7777', '1234', '6789', '9876', '3210']) {
      assert.isTrue(isWeakPin(pin), pin)
    }
    assert.isFalse(isWeakPin('4827'))
    assert.throws(() => assertValidSecret('client', '1234'), /trop facile/)
  })

  test('garde un mot de passe de 8 caractères aux autres rôles', ({ assert }) => {
    assert.throws(() => assertValidSecret('proprio', '4827'), /8 caractères/)
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
