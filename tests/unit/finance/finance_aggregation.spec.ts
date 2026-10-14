import { test } from '@japa/runner'
import {
  aggregateGrossRevenue,
  aggregateRevenuePoints,
} from '#features/finance/repositories/finance_repository'
import { stayTypeOccupancyDays } from '#features/bookings/stay_type'

test.group('aggregateRevenuePoints', () => {
  test('répartit un séjour à cheval entre ses deux mois', ({ assert }) => {
    const points = aggregateRevenuePoints(
      [
        {
          start_date: new Date('2026-10-28T12:00:00Z'),
          end_date: new Date('2026-11-03T12:00:00Z'),
          total_amount: 60000,
        },
      ],
      {}
    )

    assert.lengthOf(points, 2)
    assert.deepEqual(points[0], { month: 'Oct', value: 40000 })
    assert.deepEqual(points[1], { month: 'Nov', value: 20000 })
  })

  test('cumule plusieurs séjours du même mois', ({ assert }) => {
    const points = aggregateRevenuePoints(
      [
        {
          start_date: new Date('2026-10-01T12:00:00Z'),
          end_date: new Date('2026-10-03T12:00:00Z'),
          total_amount: 20000,
        },
        {
          start_date: new Date('2026-10-10T12:00:00Z'),
          end_date: new Date('2026-10-12T12:00:00Z'),
          total_amount: 30000,
        },
      ],
      {}
    )

    assert.lengthOf(points, 1)
    assert.equal(points[0].value, 50000)
  })

  test('les mois sont ordonnés du plus ancien au plus récent', ({ assert }) => {
    const points = aggregateRevenuePoints(
      [
        {
          start_date: new Date('2026-12-01T12:00:00Z'),
          end_date: new Date('2026-12-03T12:00:00Z'),
          total_amount: 10000,
        },
        {
          start_date: new Date('2026-10-01T12:00:00Z'),
          end_date: new Date('2026-10-03T12:00:00Z'),
          total_amount: 10000,
        },
      ],
      {}
    )

    assert.deepEqual(
      points.map((p) => p.month),
      ['Oct', 'Déc']
    )
  })
})

test.group('aggregateGrossRevenue', () => {
  // Le cas de référence de la spécification : 28 oct → 3 nov, 60 000 F.
  const referenceBooking = {
    start_date: new Date('2026-10-28T12:00:00Z'),
    end_date: new Date('2026-11-03T12:00:00Z'),
    total_amount: 60000,
  }

  const octobre = { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-11-01T00:00:00Z') }

  test('ne retient que la part de la fenêtre pour un séjour à cheval', ({ assert }) => {
    // Le graphique affichait « Oct : 40 000 » pendant que le chiffre clé
    // annonçait 60 000 : la même page se contredisait, et `benefice_net`
    // héritait du faux.
    assert.equal(aggregateGrossRevenue([referenceBooking], octobre), 40000)
  })

  test('égale la somme des revenue_points sur la même fenêtre', ({ assert }) => {
    const points = aggregateRevenuePoints([referenceBooking], octobre)
    const somme = points.reduce((total, point) => total + point.value, 0)

    assert.equal(aggregateGrossRevenue([referenceBooking], octobre), somme)
  })

  test('sans fenêtre, retourne le montant intégral de chaque réservation', ({ assert }) => {
    const bookings = [
      referenceBooking,
      {
        start_date: new Date('2026-10-10T12:00:00Z'),
        end_date: new Date('2026-10-12T12:00:00Z'),
        total_amount: 15000,
      },
    ]

    assert.equal(aggregateGrossRevenue(bookings, {}), 75000)
    assert.equal(
      aggregateGrossRevenue(bookings, {}),
      aggregateRevenuePoints(bookings, {}).reduce((total, point) => total + point.value, 0)
    )
  })

  test('un séjour entièrement hors fenêtre ne rapporte rien', ({ assert }) => {
    // `findForRevenue` retient les séjours qui chevauchent la borne : le
    // filtrage par tranche est le seul rempart contre le double comptage d'un
    // mois à l'autre.
    assert.equal(
      aggregateGrossRevenue(
        [
          {
            start_date: new Date('2026-12-01T12:00:00Z'),
            end_date: new Date('2026-12-05T12:00:00Z'),
            total_amount: 40000,
          },
        ],
        octobre
      ),
      0
    )
  })

  test('les douze mois cumulés ne dépassent pas le chiffre d’affaires réel', ({ assert }) => {
    const novembre = {
      from: new Date('2026-11-01T00:00:00Z'),
      to: new Date('2026-12-01T00:00:00Z'),
    }

    assert.equal(
      aggregateGrossRevenue([referenceBooking], octobre) +
        aggregateGrossRevenue([referenceBooking], novembre),
      60000
    )
  })
})

test.group('pondération de l’occupation', () => {
  test('une demi-journée immobilise le bien une demi-journée', ({ assert }) => {
    // Sans pondération, un enchaînement de demi-journées afficherait un taux
    // d'occupation double du réel.
    assert.equal(stayTypeOccupancyDays('half_day', 1), 0.5)
  })

  test('un séjour complet immobilise le bien un jour par jour', ({ assert }) => {
    assert.equal(stayTypeOccupancyDays('full_day', 4), 4)
  })
})
