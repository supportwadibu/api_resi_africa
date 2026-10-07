import { test } from '@japa/runner'

import { matchesInMemory, type ExpenseRecord } from '#models/expense'

function expense(fields: Partial<ExpenseRecord>): ExpenseRecord {
  return {
    _id: 'e',
    owner_id: 'owner',
    property_id: null,
    residence_id: null,
    category: 'other',
    amount: 1000,
    spent_at: new Date('2026-10-05T00:00:00Z'),
    note: null,
    created_at: new Date('2026-10-05T00:00:00Z'),
    updated_at: new Date('2026-10-05T00:00:00Z'),
    ...fields,
  }
}

test.group('Dépenses : filtre par résidence', () => {
  const common = expense({ residence_id: 'res-1' })
  const ownUnit = expense({ property_id: 'unit-1' })
  const otherUnit = expense({ property_id: 'unit-9' })
  const otherResidence = expense({ residence_id: 'res-2' })

  test('avec ses logements, la résidence retient charges communes et charges des unités', ({
    assert,
  }) => {
    // Même périmètre que le relevé Finance : la ventilation de l'écran doit
    // sommer au total « Dépenses » affiché au-dessus.
    const filters = { residence_id: 'res-1', residence_unit_ids: ['unit-1', 'unit-2'] }

    assert.isTrue(matchesInMemory(common, filters))
    assert.isTrue(matchesInMemory(ownUnit, filters))
    assert.isFalse(matchesInMemory(otherUnit, filters))
    assert.isFalse(matchesInMemory(otherResidence, filters))
  })

  test('un gérant ne se voit pas imputer les charges communes', ({ assert }) => {
    const filters = {
      residence_id: 'res-1',
      residence_unit_ids: ['unit-1'],
      scope_property_ids: ['unit-1'],
    }

    assert.isFalse(matchesInMemory(common, filters))
    assert.isTrue(matchesInMemory(ownUnit, filters))
  })
})
