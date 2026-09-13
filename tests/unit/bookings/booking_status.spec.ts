import { test } from '@japa/runner'
import { BOOKING_STATUSES } from '#models/booking'

test.group('BOOKING_STATUSES', () => {
  test('inclut le séjour en cours', ({ assert }) => {
    // Un check-in crée directement une réservation en cours : le client est
    // déjà dans le logement, « confirmed » décrirait mal la situation.
    assert.include([...BOOKING_STATUSES], 'in_progress')
  })

  test('conserve les statuts existants', ({ assert }) => {
    // Des documents les portent déjà ; les retirer rendrait leur lecture
    // invalide.
    assert.include([...BOOKING_STATUSES], 'confirmed')
    assert.include([...BOOKING_STATUSES], 'cancelled')
    assert.include([...BOOKING_STATUSES], 'completed')
  })
})
