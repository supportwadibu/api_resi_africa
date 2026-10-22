import { test } from '@japa/runner'

import { PLAN_CATALOG, planToSync } from '#features/plans/plan_catalog'

const plan = (overrides: Record<string, unknown>) => ({
  _id: 'p',
  tier: 'pro',
  is_active: true,
  ...overrides,
})

test.group('PLAN_CATALOG', () => {
  test('RESI Pro à 3 000 F, RESI Pro+ à 5 000 F, sur un mois', ({ assert }) => {
    const pro = PLAN_CATALOG.find((p) => p.tier === 'pro')!
    const proPlus = PLAN_CATALOG.find((p) => p.tier === 'pro_plus')!

    assert.equal(pro.name, 'RESI Pro')
    assert.equal(pro.price, 3000)
    assert.equal(proPlus.name, 'RESI Pro+')
    assert.equal(proPlus.price, 5000)
    assert.equal(pro.duration_days, 30)
    assert.equal(proPlus.duration_days, 30)
  })

  test('chaque fonction tient dans la limite du validateur', ({ assert }) => {
    // `features` est saisissable depuis le backoffice, limité à 80 caractères.
    for (const entry of PLAN_CATALOG) {
      assert.isAbove(entry.features.length, 0)
      for (const line of entry.features) assert.isAtMost(line.length, 80)
    }
  })
})

test.group('planToSync', () => {
  test('préfère le plan actif du palier', ({ assert }) => {
    const plans = [
      plan({ _id: 'ancien', is_active: false }),
      plan({ _id: 'actif' }),
      plan({ _id: 'autre-palier', tier: 'pro_plus' }),
    ]
    assert.equal(planToSync(plans, 'pro')?._id, 'actif')
  })

  test('à défaut, reprend un plan inactif du palier', ({ assert }) => {
    assert.equal(planToSync([plan({ _id: 'ancien', is_active: false })], 'pro')?._id, 'ancien')
  })

  test('un plan sans palier vaut Pro+, comme à la lecture', ({ assert }) => {
    // Plans antérieurs aux paliers : `readPlanTier` les lit `pro_plus`.
    assert.equal(
      planToSync([plan({ _id: 'historique', tier: undefined })], 'pro_plus')?._id,
      'historique'
    )
    assert.isNull(planToSync([plan({ _id: 'historique', tier: undefined })], 'pro'))
  })

  test('aucun plan du palier : à créer', ({ assert }) => {
    assert.isNull(planToSync([], 'pro'))
  })
})
