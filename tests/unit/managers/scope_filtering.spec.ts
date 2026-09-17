import { test } from '@japa/runner'

import { filterByScope } from '#features/managers/scope'

import type { ActorScope } from '#features/managers/scope'

const OWNER: ActorScope = { ownerId: 'owner-1', actorId: 'owner-1', propertyIds: null }
const MANAGER: ActorScope = {
  ownerId: 'owner-1',
  actorId: 'gerant-1',
  propertyIds: ['studio-1', 'studio-2'],
}

const DOCS = [
  { _id: 'b1', property_id: 'studio-1', total_amount: 10000 },
  { _id: 'b2', property_id: 'studio-2', total_amount: 20000 },
  { _id: 'b3', property_id: 'studio-3', total_amount: 30000 },
  { _id: 'b4', property_id: 'studio-4', total_amount: 40000 },
]

test.group('filterByScope', () => {
  test('le propriétaire voit tout', ({ assert }) => {
    assert.lengthOf(filterByScope(DOCS, OWNER), 4)
  })

  test('le gérant ne voit que son périmètre', ({ assert }) => {
    const kept = filterByScope(DOCS, MANAGER)

    assert.lengthOf(kept, 2)
    assert.deepEqual(
      kept.map((d) => d._id),
      ['b1', 'b2']
    )
  })

  test('6 logements affectés sur 10 : les 4 autres n’apparaissent pas', ({ assert }) => {
    // L'invariant central de la spec. Une résidence de 10 logements, 6 affectés.
    const units = Array.from({ length: 10 }, (_, i) => ({
      _id: `b${i}`,
      property_id: `unit-${i}`,
      total_amount: 1000,
    }))
    const scope: ActorScope = {
      ownerId: 'owner-1',
      actorId: 'gerant-1',
      propertyIds: ['unit-0', 'unit-1', 'unit-2', 'unit-3', 'unit-4', 'unit-5'],
    }

    const kept = filterByScope(units, scope)

    assert.lengthOf(kept, 6)
    assert.equal(
      kept.reduce((sum, d) => sum + d.total_amount, 0),
      6000
    )
  })

  test('un périmètre vide ne laisse rien passer', ({ assert }) => {
    const scope: ActorScope = { ownerId: 'owner-1', actorId: 'gerant-1', propertyIds: [] }

    assert.lengthOf(filterByScope(DOCS, scope), 0)
  })

  test('une dépense de charge commune est retirée au gérant', ({ assert }) => {
    const expenses = [
      { _id: 'e1', property_id: 'studio-1', amount: 5000 },
      { _id: 'e2', property_id: null, amount: 9000 },
    ]

    const kept = filterByScope(expenses, MANAGER)

    assert.lengthOf(kept, 1)
    assert.equal(kept[0]._id, 'e1')
  })

  test('le propriétaire conserve les charges communes', ({ assert }) => {
    const expenses = [
      { _id: 'e1', property_id: 'studio-1', amount: 5000 },
      { _id: 'e2', property_id: null, amount: 9000 },
    ]

    assert.lengthOf(filterByScope(expenses, OWNER), 2)
  })
})
