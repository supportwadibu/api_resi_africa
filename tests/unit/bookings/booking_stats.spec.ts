import { test } from '@japa/runner'

import {
  countInProgress,
  countUpcoming,
  elapsedWindow,
  growthPercent,
  monthWindow,
  occupancyForWindow,
  revenueForMonth,
} from '#features/bookings/booking_stats'

/** 15 mars 2026, midi — un instant quelconque au milieu d'un mois. */
const NOW = new Date('2026-03-15T12:00:00Z')

const booking = (
  overrides: Partial<{
    status: string
    start_date: Date
    end_date: Date
    total_amount: number
    stay_type: string
  }> = {}
) => ({
  status: 'confirmed',
  start_date: new Date('2026-03-10T12:00:00Z'),
  end_date: new Date('2026-03-12T12:00:00Z'),
  total_amount: 0,
  ...overrides,
})

test.group('monthWindow', () => {
  test('borne le mois en cours du premier jour au premier du suivant', ({ assert }) => {
    const { from, to } = monthWindow(NOW)

    assert.equal(from.toISOString(), '2026-03-01T00:00:00.000Z')
    assert.equal(to.toISOString(), '2026-04-01T00:00:00.000Z')
  })

  test('le mois précédent de janvier est décembre de l’année d’avant', ({ assert }) => {
    const { from, to } = monthWindow(new Date('2026-01-20T12:00:00Z'), -1)

    assert.equal(from.toISOString(), '2025-12-01T00:00:00.000Z')
    assert.equal(to.toISOString(), '2026-01-01T00:00:00.000Z')
  })
})

test.group('countUpcoming', () => {
  test('compte les séjours confirmés dont l’arrivée reste à venir', ({ assert }) => {
    const count = countUpcoming(
      [
        booking({ start_date: new Date('2026-03-20T12:00:00Z') }),
        booking({ start_date: new Date('2026-03-28T12:00:00Z') }),
      ],
      NOW,
      monthWindow(NOW)
    )

    assert.equal(count, 2)
  })

  test('écarte un séjour confirmé déjà commencé', ({ assert }) => {
    const count = countUpcoming(
      [booking({ start_date: new Date('2026-03-10T12:00:00Z') })],
      NOW,
      monthWindow(NOW)
    )

    assert.equal(count, 0)
  })

  test('écarte une arrivée postérieure au mois affiché', ({ assert }) => {
    const count = countUpcoming(
      [booking({ start_date: new Date('2026-08-12T12:00:00Z') })],
      NOW,
      monthWindow(NOW)
    )

    assert.equal(count, 0)
  })

  test('écarte les statuts autres que confirmé', ({ assert }) => {
    const future = new Date('2026-03-20T12:00:00Z')
    const count = countUpcoming(
      [
        booking({ status: 'in_progress', start_date: future }),
        booking({ status: 'completed', start_date: future }),
        booking({ status: 'cancelled', start_date: future }),
      ],
      NOW,
      monthWindow(NOW)
    )

    assert.equal(count, 0)
  })
})

test.group('countInProgress', () => {
  test('compte les séjours au statut en cours', ({ assert }) => {
    const count = countInProgress(
      [
        booking({ status: 'in_progress' }),
        booking({ status: 'in_progress' }),
        booking({ status: 'confirmed' }),
      ],
      monthWindow(NOW)
    )

    assert.equal(count, 2)
  })

  test('retient un séjour entamé le mois précédent et toujours actif', ({ assert }) => {
    const count = countInProgress(
      [
        booking({
          status: 'in_progress',
          start_date: new Date('2026-02-25T12:00:00Z'),
          end_date: new Date('2026-03-04T12:00:00Z'),
        }),
      ],
      monthWindow(NOW)
    )

    assert.equal(count, 1)
  })

  test('écarte un séjour entièrement hors du mois affiché', ({ assert }) => {
    const count = countInProgress(
      [
        booking({
          status: 'in_progress',
          start_date: new Date('2026-01-10T12:00:00Z'),
          end_date: new Date('2026-01-14T12:00:00Z'),
        }),
      ],
      monthWindow(NOW)
    )

    assert.equal(count, 0)
  })
})

test.group('revenueForMonth', () => {
  test('retient la part du mois pour un séjour à cheval', ({ assert }) => {
    // 6 jours du 28 février au 6 mars : 1 tombe en février (28/02 12h →
    // 01/03 00h, arrondi au jour entamé), 5 en mars.
    const revenue = revenueForMonth(
      [
        booking({
          start_date: new Date('2026-02-28T12:00:00Z'),
          end_date: new Date('2026-03-06T12:00:00Z'),
          total_amount: 60000,
        }),
      ],
      monthWindow(NOW)
    )

    assert.equal(revenue, 50000)
  })

  test('ignore un séjour entièrement hors du mois', ({ assert }) => {
    const revenue = revenueForMonth(
      [
        booking({
          start_date: new Date('2026-01-10T12:00:00Z'),
          end_date: new Date('2026-01-12T12:00:00Z'),
          total_amount: 50000,
        }),
      ],
      monthWindow(NOW)
    )

    assert.equal(revenue, 0)
  })
})

test.group('elapsedWindow', () => {
  test('arrête la fenêtre à l’instant courant', ({ assert }) => {
    const { from, to } = elapsedWindow(monthWindow(NOW), NOW)

    assert.equal(from.toISOString(), '2026-03-01T00:00:00.000Z')
    assert.equal(to.toISOString(), NOW.toISOString())
  })

  test('un mois révolu garde sa borne de fin', ({ assert }) => {
    // Le mois précédent est entièrement écoulé : le tronquer à « maintenant »
    // l'allongerait au lieu de le raccourcir.
    const previous = monthWindow(NOW, -1)
    const { to } = elapsedWindow(previous, NOW)

    assert.equal(to.toISOString(), previous.to.toISOString())
  })
})

test.group('occupancyForWindow', () => {
  test('rapporte les jours occupés à la capacité du parc', ({ assert }) => {
    // 10 jours occupés sur un parc d'un bien, en mars (31 jours).
    const rate = occupancyForWindow(
      [
        booking({
          start_date: new Date('2026-03-01T12:00:00Z'),
          end_date: new Date('2026-03-11T12:00:00Z'),
        }),
      ],
      1,
      monthWindow(NOW)
    )

    assert.closeTo(rate, 10 / 31, 0.001)
  })

  test('sur le mois écoulé, le dénominateur suit les jours passés', ({ assert }) => {
    // Du 1er au 11 mars, lu le 15 à midi : 10 jours occupés sur les 15 jours
    // entamés depuis le 1er, et non sur les 31 du mois entier.
    const rate = occupancyForWindow(
      [
        booking({
          start_date: new Date('2026-03-01T12:00:00Z'),
          end_date: new Date('2026-03-11T12:00:00Z'),
        }),
      ],
      1,
      elapsedWindow(monthWindow(NOW), NOW)
    )

    assert.closeTo(rate, 10 / 15, 0.01)
  })

  test('un parc plus grand dilue le taux', ({ assert }) => {
    const bookings = [
      booking({
        start_date: new Date('2026-03-01T12:00:00Z'),
        end_date: new Date('2026-03-11T12:00:00Z'),
      }),
    ]

    assert.closeTo(occupancyForWindow(bookings, 2, monthWindow(NOW)), 10 / 62, 0.001)
  })

  test('une demi-journée immobilise moins qu’un séjour complet', ({ assert }) => {
    const dates = {
      start_date: new Date('2026-03-01T12:00:00Z'),
      end_date: new Date('2026-03-11T12:00:00Z'),
    }

    const complet = occupancyForWindow([booking(dates)], 1, monthWindow(NOW))
    const demi = occupancyForWindow(
      [booking({ ...dates, stay_type: 'half_day' })],
      1,
      monthWindow(NOW)
    )

    assert.closeTo(demi, complet / 2, 0.001)
  })

  test('ne retient que les jours tombant dans la fenêtre', ({ assert }) => {
    // Du 25 février au 5 mars : la part de mars va du 1er 00h au 5 à 12h,
    // soit 4 jours et demi, comptés 5 au jour entamé.
    const rate = occupancyForWindow(
      [
        booking({
          start_date: new Date('2026-02-25T12:00:00Z'),
          end_date: new Date('2026-03-05T12:00:00Z'),
        }),
      ],
      1,
      monthWindow(NOW)
    )

    assert.closeTo(rate, 5 / 31, 0.001)
  })

  test('sans bien exploité, le taux n’a pas de dénominateur', ({ assert }) => {
    assert.equal(occupancyForWindow([booking()], 0, monthWindow(NOW)), 0)
  })
})

test.group('growthPercent', () => {
  test('mesure la progression d’un mois à l’autre', ({ assert }) => {
    assert.equal(growthPercent(1260840, 980200), 28.6)
  })

  test('une baisse est négative', ({ assert }) => {
    assert.equal(growthPercent(50000, 100000), -50)
  })

  test('un mois précédent à zéro ne définit aucune croissance', ({ assert }) => {
    assert.isNull(growthPercent(100000, 0))
  })

  test('deux mois à zéro ne définissent aucune croissance', ({ assert }) => {
    assert.isNull(growthPercent(0, 0))
  })
})
