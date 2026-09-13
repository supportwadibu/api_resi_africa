import { test } from '@japa/runner'
import { buildCheckOutPatch } from '#features/bookings/use_cases/check_out_booking.use_case'
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
