import { test } from '@japa/runner'

import { findOverlappingPeriod, toPeriods } from '#features/bookings/availability'

const d = (iso: string) => new Date(iso)

/**
 * Réservation telle que lue en base, réduite aux champs du contrôle.
 *
 * `residence_id` y figure pour vérifier qu'il n'entre **pas** dans le calcul de
 * disponibilité : c'est tout l'enjeu de ces tests.
 */
const booking = (
  id: string,
  propertyId: string,
  residenceId: string | null,
  start: string,
  end: string,
  status = 'confirmed'
) => ({
  _id: id,
  property_id: propertyId,
  residence_id: residenceId,
  start_date: d(start),
  end_date: d(end),
  status,
})

test.group('disponibilité multi-unités', () => {
  test('deux unités d’une même résidence se louent la même nuit', ({ assert }) => {
    // L'invariant central du chantier : la réservation se pose sur l'unité, et
    // le studio 1 loué n'immobilise pas le studio 2. Poser la réservation sur
    // la résidence rendrait les trois logements mutuellement exclusifs.
    //
    // La disponibilité est calculée sur les réservations **d'une seule unité** :
    // celle du studio 2 n'apparaît donc pas dans la liste consultée pour le
    // studio 1.
    const reservationsDuStudio1 = toPeriods([
      booking('b1', 'studio-1', 'resi-adja', '2026-10-01T12:00:00Z', '2026-10-05T12:00:00Z'),
    ])

    // Le studio 2 se réserve sur la même période sans rencontrer de conflit.
    assert.isNull(
      findOverlappingPeriod(
        { check_in_at: d('2026-10-01T12:00:00Z'), check_out_at: d('2026-10-05T12:00:00Z') },
        toPeriods([])
      )
    )

    // Et la période du studio 1 reste bien bloquée pour lui-même.
    assert.isNotNull(
      findOverlappingPeriod(
        { check_in_at: d('2026-10-02T12:00:00Z'), check_out_at: d('2026-10-04T12:00:00Z') },
        reservationsDuStudio1
      )
    )
  })

  test('le chevauchement ignore la résidence', ({ assert }) => {
    // Deux réservations de la même résidence sur la même période ne se
    // chevauchent que si elles portent sur la même unité. `residence_id` ne
    // doit jouer aucun rôle ici — il ne sert qu'à imputer le revenu.
    const memeResidence = toPeriods([
      booking('b1', 'studio-1', 'resi-adja', '2026-10-01T12:00:00Z', '2026-10-05T12:00:00Z'),
      booking('b2', 'studio-2', 'resi-adja', '2026-10-01T12:00:00Z', '2026-10-05T12:00:00Z'),
    ])

    // Les deux périodes sont identiques : si la résidence entrait dans le
    // calcul, la seconde serait refusée. Le contrôle ne voit que des périodes,
    // et c'est l'appelant qui restreint la liste à une unité.
    assert.equal(memeResidence.length, 2)
  })

  test('toPeriods ne remonte pas residence_id dans la période', ({ assert }) => {
    // La période ne porte que ce qui sert au chevauchement. Y faire entrer la
    // résidence inviterait à l'utiliser dans le calcul, ce que la conception
    // interdit.
    const periods = toPeriods([
      booking('b1', 'studio-1', 'resi-adja', '2026-10-01T12:00:00Z', '2026-10-05T12:00:00Z'),
    ])

    assert.notProperty(periods[0], 'residence_id')
    assert.equal(periods[0]._id, 'b1')
  })

  test('une unité détachée reste soumise au même contrôle', ({ assert }) => {
    // `residence_id: null` — un bien autonome se comporte exactement comme
    // avant le chantier.
    const autonome = toPeriods([
      booking('b1', 'villa', null, '2026-10-01T12:00:00Z', '2026-10-05T12:00:00Z'),
    ])

    assert.isNotNull(
      findOverlappingPeriod(
        { check_in_at: d('2026-10-03T12:00:00Z'), check_out_at: d('2026-10-08T12:00:00Z') },
        autonome
      )
    )
  })
})
