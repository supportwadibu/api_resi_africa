import { test } from '@japa/runner'

import { groupResidencesForScope } from '#features/residences/residence_scope_view'

const RESIDENCES = [
  { id: 'res-1', name: 'Les Palmiers', units_count: 10 },
  { id: 'res-2', name: 'Cocody Park', units_count: 4 },
]

/** 6 des 10 logements de `res-1` sont confiés ; aucun de `res-2`. */
const SCOPED_UNITS = [
  { id: 'u-1', residence_id: 'res-1' },
  { id: 'u-2', residence_id: 'res-1' },
  { id: 'u-3', residence_id: 'res-1' },
  { id: 'u-4', residence_id: 'res-1' },
  { id: 'u-5', residence_id: 'res-1' },
  { id: 'u-6', residence_id: 'res-1' },
  // Logement autonome : rattaché à aucune résidence.
  { id: 'u-solo', residence_id: null },
]

test.group('groupResidencesForScope', () => {
  test('ne rend que les résidences contenant un logement du périmètre', ({ assert }) => {
    const grouped = groupResidencesForScope(RESIDENCES, SCOPED_UNITS)

    assert.deepEqual(
      grouped.map((r) => r.id),
      ['res-1']
    )
  })

  test('recompte les unités sur le périmètre', ({ assert }) => {
    // Le `units_count` dénormalisé en compte 10 : le rendre tel quel
    // trahirait l'existence des 4 logements non confiés.
    const [residence] = groupResidencesForScope(RESIDENCES, SCOPED_UNITS)

    assert.equal(residence.units_count, 6)
  })

  test('n’expose que les logements du périmètre', ({ assert }) => {
    const [residence] = groupResidencesForScope(RESIDENCES, SCOPED_UNITS)

    assert.lengthOf(residence.units, 6)
    assert.deepEqual(
      residence.units.map((u) => u.id),
      ['u-1', 'u-2', 'u-3', 'u-4', 'u-5', 'u-6']
    )
  })

  test('un logement autonome ne crée aucune résidence', ({ assert }) => {
    const grouped = groupResidencesForScope(RESIDENCES, [{ id: 'u-solo', residence_id: null }])

    assert.isEmpty(grouped)
  })

  test('un périmètre vide ne rend aucune résidence', ({ assert }) => {
    assert.isEmpty(groupResidencesForScope(RESIDENCES, []))
  })

  test('une unité rattachée à une résidence inconnue est ignorée', ({ assert }) => {
    // Résidence supprimée depuis, ou appartenant à un autre compte : la
    // recomposer depuis la seule unité inventerait une fiche sans nom.
    const grouped = groupResidencesForScope(RESIDENCES, [{ id: 'u-x', residence_id: 'res-9' }])

    assert.isEmpty(grouped)
  })
})
