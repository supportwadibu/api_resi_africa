import { buildPaginationMeta } from '#features/feedbacks/use_cases/pagination'
import { test } from '@japa/runner'

test.group('buildPaginationMeta', () => {
  test('applique les valeurs par défaut', ({ assert }) => {
    const meta = buildPaginationMeta(45, {})
    assert.deepEqual(meta, { total: 45, perPage: 20, currentPage: 1, lastPage: 3 })
  })

  test('plafonne `per_page` à 100', ({ assert }) => {
    // Sans ce plafond, une requête `per_page=100000` rapatrierait la collection
    // entière — et Firestore facture chaque document lu.
    assert.equal(buildPaginationMeta(500, { per_page: 100_000 }).perPage, 100)
  })

  test('ramène une page ou un `per_page` nul à leur minimum', ({ assert }) => {
    const meta = buildPaginationMeta(10, { page: 0, per_page: 0 })
    assert.equal(meta.currentPage, 1)
    assert.equal(meta.perPage, 1)
  })

  test('annonce au moins une page sur une liste vide', ({ assert }) => {
    // `lastPage: 0` ferait afficher « page 1 sur 0 » côté application.
    assert.equal(buildPaginationMeta(0, {}).lastPage, 1)
  })
})
