import { test } from '@japa/runner'
import { computeRevpar } from '#features/reports/metrics/revpar'

test.group('computeRevpar', () => {
  test('rapporte le revenu aux jours disponibles', ({ assert }) => {
    assert.equal(computeRevpar(300000, 30), 10000)
  })

  test('rend 0 quand aucun jour n’est disponible', ({ assert }) => {
    assert.equal(computeRevpar(300000, 0), 0)
  })

  test('rend 0 sur un nombre de jours négatif', ({ assert }) => {
    assert.equal(computeRevpar(300000, -5), 0)
  })

  test('arrondit à l’unité : le franc CFA n’a pas de centime', ({ assert }) => {
    assert.equal(computeRevpar(100000, 3), 33333)
  })
})
