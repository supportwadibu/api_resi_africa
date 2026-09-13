import { test } from '@japa/runner'
import { findOverlappingPeriod, periodsOverlap, toPeriods } from '#features/bookings/availability'

const d = (iso: string) => new Date(iso)

test.group('periodsOverlap', () => {
  test('deux périodes disjointes ne se chevauchent pas', ({ assert }) => {
    assert.isFalse(
      periodsOverlap(
        d('2026-10-01T12:00:00Z'),
        d('2026-10-05T12:00:00Z'),
        d('2026-10-10T12:00:00Z'),
        d('2026-10-15T12:00:00Z')
      )
    )
  })

  test('une sortie à 12h et une entrée à 12h le même jour ne se chevauchent pas', ({ assert }) => {
    // Bornes strictes : c'est ce qui permet d'enchaîner deux séjours dans la
    // même journée, conformément à la règle 12h → 12h.
    assert.isFalse(
      periodsOverlap(
        d('2026-10-01T12:00:00Z'),
        d('2026-10-05T12:00:00Z'),
        d('2026-10-05T12:00:00Z'),
        d('2026-10-08T12:00:00Z')
      )
    )
  })

  test('un chevauchement partiel est détecté', ({ assert }) => {
    assert.isTrue(
      periodsOverlap(
        d('2026-10-01T12:00:00Z'),
        d('2026-10-06T12:00:00Z'),
        d('2026-10-05T12:00:00Z'),
        d('2026-10-08T12:00:00Z')
      )
    )
  })

  test('une période englobant l’autre est un chevauchement', ({ assert }) => {
    assert.isTrue(
      periodsOverlap(
        d('2026-10-01T12:00:00Z'),
        d('2026-10-20T12:00:00Z'),
        d('2026-10-05T12:00:00Z'),
        d('2026-10-08T12:00:00Z')
      )
    )
  })

  test('une période incluse dans l’autre est un chevauchement', ({ assert }) => {
    assert.isTrue(
      periodsOverlap(
        d('2026-10-05T12:00:00Z'),
        d('2026-10-08T12:00:00Z'),
        d('2026-10-01T12:00:00Z'),
        d('2026-10-20T12:00:00Z')
      )
    )
  })
})

test.group('findOverlappingPeriod', () => {
  const candidate = {
    check_in_at: d('2026-10-05T12:00:00Z'),
    check_out_at: d('2026-10-08T12:00:00Z'),
  }

  test('retourne null quand aucune réservation ne chevauche', ({ assert }) => {
    const existing = [
      {
        check_in_at: d('2026-10-01T12:00:00Z'),
        check_out_at: d('2026-10-05T12:00:00Z'),
        status: 'confirmed',
      },
    ]
    assert.isNull(findOverlappingPeriod(candidate, existing))
  })

  test('retourne la réservation qui chevauche', ({ assert }) => {
    const existing = [
      {
        check_in_at: d('2026-10-06T12:00:00Z'),
        check_out_at: d('2026-10-10T12:00:00Z'),
        status: 'confirmed',
      },
    ]
    assert.isNotNull(findOverlappingPeriod(candidate, existing))
  })

  test('une réservation annulée n’empêche pas de réserver', ({ assert }) => {
    const existing = [
      {
        check_in_at: d('2026-10-06T12:00:00Z'),
        check_out_at: d('2026-10-10T12:00:00Z'),
        status: 'cancelled',
      },
    ]
    assert.isNull(findOverlappingPeriod(candidate, existing))
  })

  test('une réservation terminée n’empêche pas de réserver', ({ assert }) => {
    const existing = [
      {
        check_in_at: d('2026-10-06T12:00:00Z'),
        check_out_at: d('2026-10-10T12:00:00Z'),
        status: 'completed',
      },
    ]
    assert.isNull(findOverlappingPeriod(candidate, existing))
  })

  test('un séjour en cours empêche de réserver', ({ assert }) => {
    const existing = [
      {
        check_in_at: d('2026-10-06T12:00:00Z'),
        check_out_at: d('2026-10-10T12:00:00Z'),
        status: 'in_progress',
      },
    ]
    assert.isNotNull(findOverlappingPeriod(candidate, existing))
  })
})

test.group('toPeriods', () => {
  test('une réservation en ligne replie sur start_date / end_date', ({ assert }) => {
    // `createWithPropertyReservation` n'écrit ni `check_in_at` ni
    // `check_out_at` : sans ce repli, un séjour payé en ligne serait invisible
    // au contrôle de chevauchement.
    const periods = toPeriods([
      {
        start_date: d('2026-09-10T12:00:00Z'),
        end_date: d('2026-09-15T12:00:00Z'),
        status: 'confirmed',
      },
    ])

    assert.deepEqual(periods[0].check_in_at, d('2026-09-10T12:00:00Z'))
    assert.deepEqual(periods[0].check_out_at, d('2026-09-15T12:00:00Z'))
  })

  test('une réservation comptoir garde ses horaires précis', ({ assert }) => {
    const periods = toPeriods([
      {
        start_date: d('2026-09-10T00:00:00Z'),
        end_date: d('2026-09-15T00:00:00Z'),
        check_in_at: d('2026-09-10T14:00:00Z'),
        check_out_at: d('2026-09-15T11:00:00Z'),
        status: 'confirmed',
      },
    ])

    assert.deepEqual(periods[0].check_in_at, d('2026-09-10T14:00:00Z'))
    assert.deepEqual(periods[0].check_out_at, d('2026-09-15T11:00:00Z'))
  })

  test('un séjour en ligne bloque bien une réservation comptoir qui le chevauche', ({ assert }) => {
    // Le scénario du constat : réservation en ligne du 10 au 15 septembre,
    // saisie comptoir du 12 au 14 sur le même bien.
    const enLigne = toPeriods([
      {
        start_date: d('2026-09-10T12:00:00Z'),
        end_date: d('2026-09-15T12:00:00Z'),
        status: 'confirmed',
      },
    ])

    assert.isNotNull(
      findOverlappingPeriod(
        { check_in_at: d('2026-09-12T12:00:00Z'), check_out_at: d('2026-09-14T12:00:00Z') },
        enLigne
      )
    )
  })
})
