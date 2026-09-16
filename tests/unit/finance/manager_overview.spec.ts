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
    // Chaque logement porte un montant distinct : le total ne peut alors être
    // atteint que par la bonne combinaison de six, là où des montants égaux
    // laisseraient passer n'importe quel sous-ensemble de la même taille.
    const bookings = Array.from({ length: 10 }, (_, i) => ({
      property_id: `unit-${i}`,
      start_date: new Date('2026-10-01T12:00:00Z'),
      end_date: new Date('2026-10-04T12:00:00Z'),
      total_amount: (i + 1) * 1000,
    }))

    const overview = buildManagerOverview({
      scope: SCOPE,
      bookings,
      expenses: EXPENSES,
      from: new Date('2026-10-01T00:00:00Z'),
      to: new Date('2026-10-31T23:59:59Z'),
    })

    // `unit-0` à `unit-5` : 1000 + … + 6000. Les 10 totaliseraient 55 000, et
    // aucun autre sous-ensemble de six ne vaut 21 000.
    assert.equal(overview.gross_revenue, 21000)
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

  test('un séjour à cheval n’impute à la fenêtre que sa part de jours', ({ assert }) => {
    // 28 octobre → 3 novembre, 60 000 F sur 6 jours : 4 jours en octobre, 2 en
    // novembre. La fenêtre s'arrête au 31 octobre, donc 40 000 lui reviennent.
    //
    // C'est le cas qui sépare les deux implémentations : la somme naïve des
    // `total_amount` rendrait les 60 000 entiers, et ferait diverger le chiffre
    // clé du cumul du graphique sur la même page.
    const overview = buildManagerOverview({
      scope: SCOPE,
      bookings: [
        {
          property_id: 'unit-0',
          start_date: new Date('2026-10-28T12:00:00Z'),
          end_date: new Date('2026-11-03T12:00:00Z'),
          total_amount: 60000,
        },
      ],
      expenses: [],
      from: new Date('2026-10-01T00:00:00Z'),
      to: new Date('2026-10-31T23:59:59Z'),
    })

    assert.equal(overview.gross_revenue, 40000)
    assert.notEqual(overview.gross_revenue, 60000)

    // Le graphique et le chiffre clé dérivent des mêmes tranches : deux totaux
    // contradictoires sur la même page trahiraient un calcul séparé.
    const charted = overview.revenue_points.reduce((sum, point) => sum + point.value, 0)
    assert.equal(charted, overview.gross_revenue)
  })

  test('le graphique mensuel ne porte que le périmètre', ({ assert }) => {
    const overview = buildManagerOverview({
      scope: SCOPE,
      bookings: BOOKINGS,
      expenses: EXPENSES,
      from: new Date('2026-10-01T00:00:00Z'),
      to: new Date('2026-10-31T23:59:59Z'),
    })

    const charted = overview.revenue_points.reduce((sum, point) => sum + point.value, 0)
    assert.equal(charted, overview.gross_revenue)
    assert.equal(charted, 180000)
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
    // Deux séjours qui se chevauchent sur le même logement : 10 + 10 jours
    // occupés pour une capacité de 10 jours-logement, soit un ratio brut de 2.
    // Un chevauchement ne devrait pas exister, mais l'historique en porte, et
    // sans plafond le relevé afficherait 200 % d'occupation.
    const sejour = {
      property_id: 'unit-0',
      start_date: new Date('2026-09-01T12:00:00Z'),
      end_date: new Date('2026-12-01T12:00:00Z'),
      total_amount: 50000,
    }

    const rate = computeOccupancyRate(
      [sejour, { ...sejour }],
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
