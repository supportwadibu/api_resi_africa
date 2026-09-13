import { test } from '@japa/runner'

import {
  computeClientStats,
  type StatsCountableBooking,
} from '#features/clients/use_cases/compute_client_stats.use_case'

function booking(overrides: Partial<StatsCountableBooking> = {}): StatsCountableBooking {
  return {
    status: 'completed',
    total_amount: 50000,
    start_date: new Date('2026-08-01'),
    ...overrides,
  }
}

test.group('computeClientStats', () => {
  test('un carnet sans réservation reste à zéro', ({ assert }) => {
    assert.deepEqual(computeClientStats([]), {
      total_stays: 0,
      total_paid: 0,
      last_stay_at: null,
    })
  })

  test('compte un séjour confirmé non encore clôturé', ({ assert }) => {
    // Le cœur de la régression corrigée : un propriétaire qui ne clôture pas
    // ses séjours à la main voyait toutes ses fiches figées à zéro.
    const stats = computeClientStats([booking({ status: 'confirmed' })])

    assert.equal(stats.total_stays, 1)
    assert.equal(stats.total_paid, 50000)
  })

  test('compte un séjour en cours', ({ assert }) => {
    assert.equal(computeClientStats([booking({ status: 'in_progress' })]).total_stays, 1)
  })

  test('écarte une réservation annulée', ({ assert }) => {
    const stats = computeClientStats([booking(), booking({ status: 'cancelled' })])

    assert.equal(stats.total_stays, 1)
    assert.equal(stats.total_paid, 50000)
  })

  test('retient le montant encaissé plutôt que le tarif attendu', ({ assert }) => {
    // Au comptoir, le montant reçu est négocié sous le tarif : c'est lui qui
    // est entré en caisse.
    const stats = computeClientStats([booking({ total_amount: 50000, received_amount: 35000 })])

    assert.equal(stats.total_paid, 35000)
  })

  test('se replie sur `total_amount` quand le montant reçu est absent', ({ assert }) => {
    // Les réservations en ligne, et l'historique antérieur à `received_amount`,
    // sont payées intégralement à la réservation.
    assert.equal(computeClientStats([booking({ received_amount: undefined })]).total_paid, 50000)
  })

  test('cumule plusieurs séjours', ({ assert }) => {
    const stats = computeClientStats([
      booking({ received_amount: 30000 }),
      booking({ received_amount: 20000 }),
      booking({ status: 'confirmed', received_amount: 15000 }),
    ])

    assert.equal(stats.total_stays, 3)
    assert.equal(stats.total_paid, 65000)
  })

  test('retient la date du séjour le plus récent, quel que soit l’ordre', ({ assert }) => {
    const stats = computeClientStats([
      booking({ start_date: new Date('2026-03-10') }),
      booking({ start_date: new Date('2026-09-02') }),
      booking({ start_date: new Date('2026-06-15') }),
    ])

    assert.deepEqual(stats.last_stay_at, new Date('2026-09-02'))
  })

  test('préfère l’arrivée réelle à la date portée par la réservation', ({ assert }) => {
    // Au comptoir, le client peut se présenter après la date réservée.
    const stats = computeClientStats([
      booking({ start_date: new Date('2026-08-01'), check_in_at: new Date('2026-08-03') }),
    ])

    assert.deepEqual(stats.last_stay_at, new Date('2026-08-03'))
  })

  test('une annulation plus récente ne déplace pas la date du dernier séjour', ({ assert }) => {
    const stats = computeClientStats([
      booking({ start_date: new Date('2026-05-01') }),
      booking({ status: 'cancelled', start_date: new Date('2026-11-20') }),
    ])

    assert.deepEqual(stats.last_stay_at, new Date('2026-05-01'))
  })

  test('un séjour sans date ne fait pas échouer le calcul', ({ assert }) => {
    // L'historique le plus ancien peut porter des dates illisibles ; un cumul
    // partiel vaut mieux qu'une fiche impossible à ouvrir.
    const stats = computeClientStats([booking({ start_date: null, check_in_at: null })])

    assert.equal(stats.total_stays, 1)
    assert.isNull(stats.last_stay_at)
  })
})
