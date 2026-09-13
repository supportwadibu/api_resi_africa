import { test } from '@japa/runner'

import { findExtensionConflict, toPeriods } from '#features/bookings/availability'
import { assertExtensionBounds } from '#features/bookings/stay_pricing'
import { DomainError } from '#utils/domain_error'

import type { PropertyPricing } from '#models/property'

const d = (iso: string) => new Date(iso)

/**
 * Capture le `DomainError` levé par `fn`.
 *
 * `assert.throws` ne rend rien : il valide le type de l'erreur mais laisse
 * son `code` — la partie consommée par le mobile — hors de portée.
 */
function captureDomainError(fn: () => void): DomainError {
  try {
    fn()
  } catch (error) {
    if (error instanceof DomainError) return error
    throw error
  }

  throw new Error('aucune erreur levée')
}

/** Réservation telle que lue en base, réduite aux champs du contrôle. */
const booking = (id: string, start: string, end: string, status = 'confirmed') => ({
  _id: id,
  start_date: d(start),
  end_date: d(end),
  status,
})

const pricing = (over: Partial<PropertyPricing> = {}): PropertyPricing => ({
  daily_price: 10000,
  price_tiers: [],
  minimum_stay_days: 1,
  maximum_stay_days: null,
  ...over,
})

test.group('findExtensionConflict', () => {
  test('une prolongation sur une période libre passe', ({ assert }) => {
    const existing = toPeriods([booking('autre', '2026-10-20T12:00:00Z', '2026-10-25T12:00:00Z')])

    // Séjour du 1er au 5, prolongé au 10 : le segment gagné (5 → 10) ne touche
    // pas la réservation du 20.
    assert.isNull(
      findExtensionConflict('moi', d('2026-10-05T12:00:00Z'), d('2026-10-10T12:00:00Z'), existing)
    )
  })

  test('la réservation prolongée ne se heurte pas à elle-même', ({ assert }) => {
    // Le bug qu'un contrôle naïf produit : la réservation en cours de
    // prolongation figure parmi les réservations actives du bien, et un
    // contrôle qui ne l'écarte pas refuserait toute prolongation.
    //
    // Le séjour est ici prolongé *depuis une borne intérieure* à sa propre
    // période — le cas d'un séjour `in_progress` dont la sortie prévue est
    // repoussée alors qu'on recalcule depuis la sortie initiale. Sans
    // l'exclusion par identifiant, le segment contrôlé recouvre la
    // réservation elle-même et la prolongation est refusée à tort.
    const existing = toPeriods([booking('moi', '2026-10-01T12:00:00Z', '2026-10-05T12:00:00Z')])

    assert.isNull(
      findExtensionConflict('moi', d('2026-10-03T12:00:00Z'), d('2026-10-10T12:00:00Z'), existing)
    )
  })

  test('seule la réservation prolongée est écartée, pas les autres', ({ assert }) => {
    // Contre-épreuve de l'exclusion : elle doit porter sur le seul
    // identifiant prolongé. Une exclusion trop large laisserait passer le
    // double booking qu'on cherche à empêcher.
    const existing = toPeriods([
      booking('moi', '2026-10-01T12:00:00Z', '2026-10-05T12:00:00Z'),
      booking('autre', '2026-10-02T12:00:00Z', '2026-10-12T12:00:00Z'),
    ])

    const conflict = findExtensionConflict(
      'moi',
      d('2026-10-03T12:00:00Z'),
      d('2026-10-10T12:00:00Z'),
      existing
    )

    assert.equal(conflict?._id, 'autre')
  })

  test('une prolongation empiétant sur une réservation confirmée est refusée', ({ assert }) => {
    // Cas du double booking : prolonger du 5 au 10 alors qu'un séjour commence
    // le 7. Sans ce contrôle, les deux coexistaient et deux clients se
    // présentaient pour le même logement.
    const existing = toPeriods([booking('autre', '2026-10-07T12:00:00Z', '2026-10-12T12:00:00Z')])

    const conflict = findExtensionConflict(
      'moi',
      d('2026-10-05T12:00:00Z'),
      d('2026-10-10T12:00:00Z'),
      existing
    )

    assert.isNotNull(conflict)
    assert.equal(conflict?._id, 'autre')
  })

  test('une réservation commençant à l’heure exacte de l’ancienne sortie n’est pas un conflit', ({
    assert,
  }) => {
    // Bornes strictes, règle 12h → 12h : la prolongation s'arrête là où l'autre
    // séjour commence. Elle serait refusée, mais pas pour chevauchement — c'est
    // le cas limite qui doit rester passant quand la sortie ne bouge pas.
    const existing = toPeriods([booking('autre', '2026-10-05T12:00:00Z', '2026-10-12T12:00:00Z')])

    assert.isNull(
      findExtensionConflict('moi', d('2026-10-05T12:00:00Z'), d('2026-10-05T12:00:00Z'), existing)
    )
  })

  test('une réservation annulée ne bloque pas la prolongation', ({ assert }) => {
    const existing = toPeriods([
      booking('annulee', '2026-10-06T12:00:00Z', '2026-10-12T12:00:00Z', 'cancelled'),
    ])

    assert.isNull(
      findExtensionConflict('moi', d('2026-10-05T12:00:00Z'), d('2026-10-10T12:00:00Z'), existing)
    )
  })

  test('un séjour en cours bloque la prolongation', ({ assert }) => {
    const existing = toPeriods([
      booking('encours', '2026-10-06T12:00:00Z', '2026-10-12T12:00:00Z', 'in_progress'),
    ])

    assert.isNotNull(
      findExtensionConflict('moi', d('2026-10-05T12:00:00Z'), d('2026-10-10T12:00:00Z'), existing)
    )
  })

  test('une réservation en ligne sans check_out_at est prise en compte', ({ assert }) => {
    // Les réservations en ligne ne portent que `start_date`/`end_date` : les
    // ignorer laisserait une prolongation se poser sur un séjour déjà payé.
    const existing = toPeriods([
      {
        _id: 'enligne',
        start_date: d('2026-10-07T12:00:00Z'),
        end_date: d('2026-10-12T12:00:00Z'),
        status: 'confirmed',
      },
    ])

    assert.isNotNull(
      findExtensionConflict('moi', d('2026-10-05T12:00:00Z'), d('2026-10-10T12:00:00Z'), existing)
    )
  })

  test('toPeriods conserve l’identifiant', ({ assert }) => {
    // Sans `_id`, la prolongation ne peut pas s'exclure elle-même.
    const periods = toPeriods([booking('moi', '2026-10-01T12:00:00Z', '2026-10-05T12:00:00Z')])

    assert.equal(periods[0]._id, 'moi')
  })
})

test.group('assertExtensionBounds', () => {
  const start = d('2026-10-01T12:00:00Z')
  const currentEnd = d('2026-10-05T12:00:00Z')

  test('une prolongation vers l’avant passe', ({ assert }) => {
    assert.doesNotThrow(() =>
      assertExtensionBounds(pricing(), start, currentEnd, d('2026-10-10T12:00:00Z'))
    )
  })

  test('une sortie antérieure à l’entrée est refusée', ({ assert }) => {
    // VineJS ne voit que la forme de `end_date` et ignore la date de début, qui
    // vit en base : une sortie antérieure produisait un `days_count` négatif.
    const error = captureDomainError(() =>
      assertExtensionBounds(pricing(), start, currentEnd, d('2026-09-20T12:00:00Z'))
    )

    assert.equal(error.code, 'invalid_stay_dates')
    assert.equal(error.status, 422)
  })

  test('une sortie qui raccourcit le séjour est refusée', ({ assert }) => {
    const error = captureDomainError(() =>
      assertExtensionBounds(pricing(), start, currentEnd, d('2026-10-03T12:00:00Z'))
    )

    assert.equal(error.code, 'invalid_extension')
  })

  test('une sortie identique à l’actuelle est refusée', ({ assert }) => {
    assert.throws(
      () => assertExtensionBounds(pricing(), start, currentEnd, currentEnd),
      DomainError
    )
  })

  test('le séjour maximum du bien est revérifié', ({ assert }) => {
    // La création respecte le maximum, mais rien n'empêchait de l'atteindre par
    // prolongations successives.
    const error = captureDomainError(() =>
      assertExtensionBounds(
        pricing({ maximum_stay_days: 7 }),
        start,
        currentEnd,
        d('2026-10-15T12:00:00Z')
      )
    )

    assert.equal(error.code, 'maximum_stay_exceeded')
  })

  test('un bien sans maximum accepte une longue prolongation', ({ assert }) => {
    assert.doesNotThrow(() =>
      assertExtensionBounds(
        pricing({ maximum_stay_days: null }),
        start,
        currentEnd,
        d('2026-12-31T12:00:00Z')
      )
    )
  })
})
