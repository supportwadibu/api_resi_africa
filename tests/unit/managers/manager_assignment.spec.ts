import { test } from '@japa/runner'

import { normalizePropertyIds } from '#models/manager_assignment'

test.group('normalizePropertyIds', () => {
  test('dédoublonne les identifiants', ({ assert }) => {
    assert.deepEqual(normalizePropertyIds(['a', 'b', 'a']), ['a', 'b'])
  })

  test('ordonne pour rendre deux affectations comparables', ({ assert }) => {
    assert.deepEqual(normalizePropertyIds(['c', 'a', 'b']), ['a', 'b', 'c'])
  })

  test('écarte les chaînes vides', ({ assert }) => {
    assert.deepEqual(normalizePropertyIds(['a', '', '  ']), ['a'])
  })

  test('rend un tableau vide inchangé', ({ assert }) => {
    assert.deepEqual(normalizePropertyIds([]), [])
  })
})
