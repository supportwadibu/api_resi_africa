import { test } from '@japa/runner'
import { averageStay } from '#features/reports/metrics/average_stay'

test.group('averageStay', () => {
  test('divise les jours d’occupation par le nombre de réservations', ({ assert }) => {
    // Même formule que `moyen_sejour` de `FinanceRepository.overview` :
    // `totalDays / bookings.length`.
    assert.equal(averageStay(13, 3), 13 / 3)
  })

  test('n’arrondit pas : le rendu décide de la précision affichée', ({ assert }) => {
    // Arrondir ici ferait diverger le rapport performance du bilan financier,
    // qui expose le quotient brut dans `FinanceSummaryDto`.
    assert.notEqual(averageStay(13, 3), 4)
  })

  test('rend 0 sur une période sans réservation plutôt qu’un NaN', ({ assert }) => {
    assert.equal(averageStay(0, 0), 0)
  })

  test('ne divise pas par un compte négatif', ({ assert }) => {
    assert.equal(averageStay(10, -1), 0)
  })

  test('reflète une demi-journée pondérée, pas un jour plein', ({ assert }) => {
    // Deux demi-journées pondérées valent 1 jour d'occupation : le séjour moyen
    // est de 0,5 j, là où une moyenne des `days_count` bruts dirait 1 j.
    assert.equal(averageStay(1, 2), 0.5)
  })
})
