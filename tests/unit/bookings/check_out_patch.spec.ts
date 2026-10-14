import { test } from '@japa/runner'
import {
  buildCheckOutPatch,
  resolveFullStayDeparture,
} from '#features/bookings/use_cases/check_out_booking.use_case'
import { splitRevenueByMonth } from '#features/finance/revenue_split'

test.group('buildCheckOutPatch', () => {
  const cloture = new Date('2026-11-10T09:00:00Z')

  test('n’écrit ni end_date ni check_out_at', ({ assert }) => {
    const patch = buildCheckOutPatch(cloture)

    // La clôture écrasait les deux avec l'instant courant, ce qui réécrivait
    // rétroactivement la période sur laquelle le montant avait été calculé.
    assert.notProperty(patch, 'end_date')
    assert.notProperty(patch, 'check_out_at')
  })

  test('consigne la sortie réelle dans un champ dédié', ({ assert }) => {
    const patch = buildCheckOutPatch(cloture)

    assert.equal(patch.status, 'completed')
    assert.deepEqual(patch.completed_at, cloture)
    assert.deepEqual(patch.actual_check_out_at, cloture)
  })

  test('la répartition du revenu ne bouge pas après une clôture tardive', ({ assert }) => {
    // Séjour du 28 octobre au 3 novembre, 60 000 F, clôturé le 10 novembre.
    // Avec `end_date` écrasée, octobre serait tombé de 40 000 à ~18 500 F.
    const debut = new Date('2026-10-28T12:00:00Z')
    const finFacturee = new Date('2026-11-03T12:00:00Z')

    const patch = buildCheckOutPatch(cloture)
    const finApresCloture = 'end_date' in patch ? (patch.end_date as Date) : finFacturee

    const octobre = splitRevenueByMonth(debut, finApresCloture, 60000)[0]

    assert.equal(octobre.days, 4)
    assert.equal(octobre.amount, 40000)
  })
})

test.group('resolveFullStayDeparture', () => {
  const entree = new Date('2026-10-01T12:00:00Z')
  const maintenant = new Date('2026-10-03T18:00:00Z')
  const booking = { start_date: entree, check_in_at: entree }

  test('sans heure déclarée, la sortie est l’instant de la clôture', ({ assert }) => {
    assert.deepEqual(resolveFullStayDeparture(booking, undefined, maintenant), maintenant)
  })

  test('retient l’heure déclarée : un départ saisi hors ligne et synchronisé plus tard', ({
    assert,
  }) => {
    const saisie = new Date('2026-10-03T11:00:00Z')

    assert.deepEqual(resolveFullStayDeparture(booking, saisie, maintenant), saisie)
  })

  test('tolère une horloge de téléphone en avance de quelques minutes', ({ assert }) => {
    const enAvance = new Date('2026-10-03T18:03:00Z')

    assert.deepEqual(resolveFullStayDeparture(booking, enAvance, maintenant), enAvance)
  })

  test('refuse une sortie dans le futur', ({ assert }) => {
    const future = new Date('2026-10-03T19:00:00Z')

    assert.throws(() => resolveFullStayDeparture(booking, future, maintenant))
  })

  test('refuse une sortie antérieure ou égale à l’entrée', ({ assert }) => {
    assert.throws(() => resolveFullStayDeparture(booking, entree, maintenant))
  })

  test('se rabat sur start_date pour une réservation antérieure à la saisie comptoir', ({
    assert,
  }) => {
    const ancienne = { start_date: entree }
    const avantEntree = new Date('2026-10-01T10:00:00Z')

    assert.throws(() => resolveFullStayDeparture(ancienne, avantEntree, maintenant))
  })
})
