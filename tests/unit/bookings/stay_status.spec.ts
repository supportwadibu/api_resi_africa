import { test } from '@japa/runner'

import { AUTO_CLOSE_GRACE_MS, resolveStayTransition } from '#features/bookings/stay_status'

const CHECK_IN = new Date('2026-10-02T13:00:00Z')
const CHECK_OUT = new Date('2026-10-03T13:00:00Z')

const stay = (status: 'confirmed' | 'in_progress' | 'completed' | 'cancelled') => ({
  status,
  start_date: CHECK_IN,
  end_date: CHECK_OUT,
  check_in_at: CHECK_IN,
  check_out_at: CHECK_OUT,
})

test.group('resolveStayTransition', () => {
  test('une réservation confirmée ne passe plus seule en cours à l’heure d’arrivée', ({
    assert,
  }) => {
    // L'arrivée s'enregistre au comptoir : un client absent n'est pas hébergé.
    assert.isNull(resolveStayTransition(stay('confirmed'), CHECK_IN))
    assert.isNull(resolveStayTransition(stay('confirmed'), CHECK_OUT))
  })

  test('un séjour en cours reste ouvert pendant le délai de grâce', ({ assert }) => {
    // Le propriétaire peut encore prolonger un client qui s'attarde.
    const justBefore = new Date(CHECK_OUT.getTime() + AUTO_CLOSE_GRACE_MS - 1)

    assert.isNull(resolveStayTransition(stay('in_progress'), CHECK_OUT))
    assert.isNull(resolveStayTransition(stay('in_progress'), justBefore))
  })

  test('passé le délai, le séjour est clos à sa sortie prévue', ({ assert }) => {
    const now = new Date(CHECK_OUT.getTime() + AUTO_CLOSE_GRACE_MS)

    assert.deepEqual(resolveStayTransition(stay('in_progress'), now), {
      status: 'completed',
      completed_at: now,
      actual_check_out_at: CHECK_OUT,
      closed_automatically: true,
    })
  })

  test('une réservation confirmée jamais ouverte est close directement', ({ assert }) => {
    const now = new Date('2026-10-05T00:00:00Z')

    assert.equal(resolveStayTransition(stay('confirmed'), now)?.status, 'completed')
  })

  test('un séjour clos ou annulé ne bouge plus', ({ assert }) => {
    const now = new Date('2026-10-05T00:00:00Z')

    assert.isNull(resolveStayTransition(stay('completed'), now))
    assert.isNull(resolveStayTransition(stay('cancelled'), now))
  })

  test('repli sur end_date pour les réservations en ligne', ({ assert }) => {
    const online = { status: 'in_progress' as const, start_date: CHECK_IN, end_date: CHECK_OUT }
    const now = new Date(CHECK_OUT.getTime() + AUTO_CLOSE_GRACE_MS)

    assert.equal(resolveStayTransition(online, now)?.status, 'completed')
  })
})
