import { test } from '@japa/runner'

import { readCreatedBy } from '#utils/created_by'

test.group('readCreatedBy', () => {
  test('rend l’auteur quand il est renseigné', ({ assert }) => {
    assert.equal(readCreatedBy({ created_by: 'gerant-1' }), 'gerant-1')
  })

  test('rend null sur un document antérieur au champ', ({ assert }) => {
    // Les documents écrits avant cette version ne portent pas `created_by` :
    // absent signifie « saisi par le propriétaire », seul acteur possible alors.
    assert.isNull(readCreatedBy({}))
  })

  test('rend null sur une valeur nulle explicite', ({ assert }) => {
    assert.isNull(readCreatedBy({ created_by: null }))
  })
})
