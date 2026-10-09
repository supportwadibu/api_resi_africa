import { test } from '@japa/runner'

import {
  buildCheckInPatch,
  startOfArrivalDay,
} from '#features/bookings/use_cases/check_in_booking.use_case'

/** Entrée prévue le 10 octobre à 14 h, sortie le 12 à 12 h. */
const CHECK_IN = new Date('2026-10-10T14:00:00Z')
const CHECK_OUT = new Date('2026-10-12T12:00:00Z')

const booking = (
  status: 'confirmed' | 'in_progress' | 'completed' | 'cancelled' = 'confirmed'
) => ({
  status,
  start_date: CHECK_IN,
  end_date: CHECK_OUT,
  check_in_at: CHECK_IN,
  check_out_at: CHECK_OUT,
})

test.group('startOfArrivalDay', () => {
  test('ramène l’entrée à minuit du jour J', ({ assert }) => {
    assert.deepEqual(startOfArrivalDay(CHECK_IN), new Date('2026-10-10T00:00:00Z'))
  })
})

test.group('buildCheckInPatch', () => {
  test('le jour J, avant l’heure prévue, l’arrivée est acceptée', ({ assert }) => {
    const now = new Date('2026-10-10T09:30:00Z')

    assert.deepEqual(buildCheckInPatch(booking(), undefined, now), {
      status: 'in_progress',
      actual_check_in_at: now,
    })
  })

  test('la veille, l’arrivée est refusée', ({ assert }) => {
    const now = new Date('2026-10-09T22:00:00Z')

    assert.throws(() => buildCheckInPatch(booking(), undefined, now), /jour du séjour/)
  })

  test('une heure saisie hors ligne est reprise telle quelle', ({ assert }) => {
    const declared = new Date('2026-10-10T15:10:00Z')
    const now = new Date('2026-10-10T18:00:00Z')

    assert.equal(
      buildCheckInPatch(booking(), declared, now).actual_check_in_at.getTime(),
      declared.getTime()
    )
  })

  test('une heure d’arrivée future ou antérieure au jour J est refusée', ({ assert }) => {
    const now = new Date('2026-10-10T15:00:00Z')

    assert.throws(
      () => buildCheckInPatch(booking(), new Date('2026-10-10T18:00:00Z'), now),
      /futur/
    )
    assert.throws(
      () => buildCheckInPatch(booking(), new Date('2026-10-09T23:00:00Z'), now),
      /jour du séjour ou après/
    )
  })

  test('après la sortie prévue, il n’y a plus de séjour à ouvrir', ({ assert }) => {
    const now = new Date('2026-10-12T13:00:00Z')

    assert.throws(() => buildCheckInPatch(booking(), undefined, now), /sortie prévue est passée/)
  })

  test('un séjour déjà ouvert, clos ou annulé est refusé', ({ assert }) => {
    const now = new Date('2026-10-10T15:00:00Z')

    assert.throws(() => buildCheckInPatch(booking('in_progress'), undefined, now), /déjà/)
    assert.throws(() => buildCheckInPatch(booking('completed'), undefined, now), /clôturé/)
    assert.throws(() => buildCheckInPatch(booking('cancelled'), undefined, now), /annulée/)
  })

  test('repli sur start_date / end_date pour une réservation en ligne', ({ assert }) => {
    const online = { status: 'confirmed' as const, start_date: CHECK_IN, end_date: CHECK_OUT }
    const now = new Date('2026-10-10T08:00:00Z')

    assert.equal(buildCheckInPatch(online, undefined, now).status, 'in_progress')
  })
})
