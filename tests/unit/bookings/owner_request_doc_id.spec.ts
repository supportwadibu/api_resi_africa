import { test } from '@japa/runner'
import Booking from '#models/booking'

test.group('Booking.ownerRequestDocId', () => {
  test('le même couple donne toujours le même identifiant', ({ assert }) => {
    // C'est cette stabilité qui porte l'idempotence : un retry doit viser le
    // document déjà écrit, sinon `create()` ne détecte rien.
    assert.equal(
      Booking.ownerRequestDocId('proprio-1', 'req-abc'),
      Booking.ownerRequestDocId('proprio-1', 'req-abc')
    )
  })

  test('deux propriétaires ne partagent pas l’identifiant d’une même requête', ({ assert }) => {
    // Sans le propriétaire dans le condensat, un `client_request_id` deviné
    // désignerait la réservation d'un autre compte.
    assert.notEqual(
      Booking.ownerRequestDocId('proprio-1', 'req-abc'),
      Booking.ownerRequestDocId('proprio-2', 'req-abc')
    )
  })

  test('deux requêtes du même propriétaire ne se confondent pas', ({ assert }) => {
    assert.notEqual(
      Booking.ownerRequestDocId('proprio-1', 'req-abc'),
      Booking.ownerRequestDocId('proprio-1', 'req-abd')
    )
  })

  test('l’identifiant reste acceptable par Firestore', ({ assert }) => {
    // Un UUID reçu du client n'est pas tenu d'éviter `/`, `.` ou `__…__`, que
    // Firestore refuse dans un identifiant de document.
    const id = Booking.ownerRequestDocId('proprio-1', 'a/b.__c__')

    assert.match(id, /^[0-9a-f]{64}$/)
  })
})
