import { test } from '@japa/runner'

import { readPlanTier, tierAllows } from '#features/plans/plan_tier'
import { legacyPlanAccess } from '#features/subscriptions/plan_access'

test.group('legacyPlanAccess', () => {
  test('aucun compte actif n’est lu inactif par une ancienne application', ({ assert }) => {
    assert.equal(legacyPlanAccess('pro_plus'), 'full')
    assert.equal(legacyPlanAccess('pro'), 'basic')
    assert.equal(legacyPlanAccess('free'), 'basic')
    assert.isNull(legacyPlanAccess(null))
  })
})

test.group('readPlanTier', () => {
  test('relit les paliers historiques sans retirer de fonction', ({ assert }) => {
    // `basic` (3 000 F) devient Pro, au même prix ; `full` et les documents
    // sans palier, qui ouvraient tout, deviennent Pro+.
    assert.equal(readPlanTier('basic'), 'pro')
    assert.equal(readPlanTier('full'), 'pro_plus')
    assert.equal(readPlanTier(undefined), 'pro_plus')
  })

  test('lit les nouveaux paliers tels quels', ({ assert }) => {
    assert.equal(readPlanTier('free'), 'free')
    assert.equal(readPlanTier('pro'), 'pro')
    assert.equal(readPlanTier('pro_plus'), 'pro_plus')
  })
})

test.group('tierAllows', () => {
  test('un palier ouvre ce qu’ouvrent les paliers inférieurs', ({ assert }) => {
    assert.isTrue(tierAllows('pro_plus', 'pro'))
    assert.isTrue(tierAllows('pro', 'free'))
    assert.isTrue(tierAllows('pro', 'pro'))
  })

  test('un palier n’ouvre pas les paliers supérieurs', ({ assert }) => {
    assert.isFalse(tierAllows('free', 'pro'))
    assert.isFalse(tierAllows('pro', 'pro_plus'))
  })
})
