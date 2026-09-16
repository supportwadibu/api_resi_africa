import { test } from '@japa/runner'

import { buildManagerOverview, computeOccupancyRate } from '#features/finance/manager_overview'

import type { ActorScope } from '#features/managers/scope'

const SCOPE: ActorScope = {
  ownerId: 'owner-1',
  actorId: 'gerant-1',
  propertyIds: ['unit-0', 'unit-1', 'unit-2', 'unit-3', 'unit-4', 'unit-5'],
}

/** Une résidence de 10 logements, dont 6 affectés au gérant. */
const BOOKINGS = Array.from({ length: 10 }, (_, i) => ({
  property_id: `unit-${i}`,
  start_date: new Date('2026-10-01T12:00:00Z'),
  end_date: new Date('2026-10-04T12:00:00Z'),
  total_amount: 30000,
}))

const EXPENSES = Array.from({ length: 10 }, (_, i) => ({
  property_id: `unit-${i}`,
  amount: 5000,
}))

test.group('buildManagerOverview', () => {
  test('ne compte que les logements affectés', ({ assert }) => {
    const overview = buildManagerOverview({
      scope: SCOPE,
      bookings: BOOKINGS,
      expenses: EXPENSES,
      from: new Date('2026-10-01T00:00:00Z'),
      to: new Date('2026-10-31T23:59:59Z'),
    })

    assert.equal(overview.bookings_count, 6)
    assert.equal(overview.gross_revenue, 180000)
  })

  test('les encaissements des logements non affectés sont absents', ({ assert }) => {
    const overview = buildManagerOverview({
      scope: SCOPE,
      bookings: BOOKINGS,
      expenses: EXPENSES,
      from: new Date('2026-10-01T00:00:00Z'),
      to: new Date('2026-10-31T23:59:59Z'),
    })

    // Les 10 logements totaliseraient 300 000 : le relevé ne doit jamais y toucher.
    assert.notEqual(overview.gross_revenue, 300000)
  })

  test('les dépenses sont cloisonnées de la même façon', ({ assert }) => {
    const overview = buildManagerOverview({
      scope: SCOPE,
      bookings: BOOKINGS,
      expenses: EXPENSES,
      from: new Date('2026-10-01T00:00:00Z'),
      to: new Date('2026-10-31T23:59:59Z'),
    })

    assert.equal(overview.expenses_total, 30000)
  })

  test('le relevé ne porte aucun revenu net', ({ assert }) => {
    const overview = buildManagerOverview({
      scope: SCOPE,
      bookings: BOOKINGS,
      expenses: EXPENSES,
      from: new Date('2026-10-01T00:00:00Z'),
      to: new Date('2026-10-31T23:59:59Z'),
    })

    // Le net déduirait des charges qui ne relèvent pas du gérant — abonnement,
    // charges communes, dépenses d'autres logements. Sur un périmètre partiel
    // ce n'est pas une marge partielle, c'est un chiffre faux.
    assert.notProperty(overview, 'net_revenue')
    assert.notProperty(overview, 'net_income')
  })

  test('un périmètre vide rend un relevé à zéro', ({ assert }) => {
    const overview = buildManagerOverview({
      scope: { ownerId: 'owner-1', actorId: 'gerant-1', propertyIds: [] },
      bookings: BOOKINGS,
      expenses: EXPENSES,
      from: new Date('2026-10-01T00:00:00Z'),
      to: new Date('2026-10-31T23:59:59Z'),
    })

    assert.equal(overview.bookings_count, 0)
    assert.equal(overview.gross_revenue, 0)
  })

  test('le propriétaire obtient le total des 10 logements', ({ assert }) => {
    const overview = buildManagerOverview({
      scope: { ownerId: 'owner-1', actorId: 'owner-1', propertyIds: null },
      bookings: BOOKINGS,
      expenses: EXPENSES,
      from: new Date('2026-10-01T00:00:00Z'),
      to: new Date('2026-10-31T23:59:59Z'),
    })

    assert.equal(overview.gross_revenue, 300000)
  })

  test('le graphique mensuel ne porte que le périmètre', ({ assert }) => {
    const overview = buildManagerOverview({
      scope: SCOPE,
      bookings: BOOKINGS,
      expenses: EXPENSES,
      from: new Date('2026-10-01T00:00:00Z'),
      to: new Date('2026-10-31T23:59:59Z'),
    })

    // Le graphique et le chiffre clé dérivent des mêmes réservations : deux
    // totaux contradictoires sur la même page trahiraient un filtrage partiel.
    const charted = overview.revenue_points.reduce((sum, point) => sum + point.value, 0)
    assert.equal(charted, overview.gross_revenue)
  })

  test('une charge commune de résidence est retirée au gérant', ({ assert }) => {
    // Sans `property_id`, elle ne relève d'aucun périmètre restreint : elle
    // couvre aussi les logements que le gérant ne sert pas.
    const overview = buildManagerOverview({
      scope: SCOPE,
      bookings: [],
      expenses: [{ property_id: null, amount: 90000 }],
      from: new Date('2026-10-01T00:00:00Z'),
      to: new Date('2026-10-31T23:59:59Z'),
    })

    assert.equal(overview.expenses_total, 0)
  })
})

test.group('computeOccupancyRate', () => {
  test('rapporte les jours occupés à la capacité du périmètre', ({ assert }) => {
    // 2 logements sur 10 jours = 20 jours-bien ; un séjour de 5 jours en occupe
    // 5, soit un quart.
    const rate = computeOccupancyRate(
      [
        {
          property_id: 'unit-0',
          start_date: new Date('2026-10-01T12:00:00Z'),
          end_date: new Date('2026-10-06T12:00:00Z'),
          total_amount: 50000,
        },
      ],
      { ownerId: 'o', actorId: 'g', propertyIds: ['unit-0', 'unit-1'] },
      new Date('2026-10-01T00:00:00Z'),
      new Date('2026-10-11T00:00:00Z')
    )

    assert.equal(rate, 0.25)
  })

  test('un périmètre vide rend zéro plutôt qu’une division par zéro', ({ assert }) => {
    const rate = computeOccupancyRate(
      [],
      { ownerId: 'o', actorId: 'g', propertyIds: [] },
      new Date('2026-10-01T00:00:00Z'),
      new Date('2026-10-11T00:00:00Z')
    )

    assert.equal(rate, 0)
    assert.isFalse(Number.isNaN(rate))
  })

  test('une fenêtre nulle rend zéro plutôt qu’une division par zéro', ({ assert }) => {
    const rate = computeOccupancyRate(
      [],
      { ownerId: 'o', actorId: 'g', propertyIds: ['unit-0'] },
      new Date('2026-10-01T00:00:00Z'),
      new Date('2026-10-01T00:00:00Z')
    )

    assert.equal(rate, 0)
    assert.isFalse(Number.isNaN(rate))
  })

  test('le taux reste plafonné à 1', ({ assert }) => {
    // Un séjour débordant largement la fenêtre donnerait sinon plus de 100 %.
    const rate = computeOccupancyRate(
      [
        {
          property_id: 'unit-0',
          start_date: new Date('2026-09-01T12:00:00Z'),
          end_date: new Date('2026-12-01T12:00:00Z'),
          total_amount: 50000,
        },
      ],
      { ownerId: 'o', actorId: 'g', propertyIds: ['unit-0'] },
      new Date('2026-10-01T00:00:00Z'),
      new Date('2026-10-11T00:00:00Z')
    )

    assert.equal(rate, 1)
  })

  test('sans périmètre borné, la capacité vient des logements réservés', ({ assert }) => {
    // Le propriétaire (`propertyIds: null`) n'a pas de liste : le dénominateur
    // se déduit des logements apparaissant dans la période, faute de mieux.
    const rate = computeOccupancyRate(
      [
        {
          property_id: 'unit-0',
          start_date: new Date('2026-10-01T12:00:00Z'),
          end_date: new Date('2026-10-06T12:00:00Z'),
          total_amount: 50000,
        },
      ],
      { ownerId: 'o', actorId: 'o', propertyIds: null },
      new Date('2026-10-01T00:00:00Z'),
      new Date('2026-10-11T00:00:00Z')
    )

    assert.equal(rate, 0.5)
  })
})
