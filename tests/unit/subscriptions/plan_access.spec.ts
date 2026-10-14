import { test } from '@japa/runner'

import { readPlanTier } from '#features/plans/plan_tier'
import { resolvePlanAccess } from '#features/subscriptions/plan_access'

const NOW = new Date('2026-09-26T10:00:00Z')
const LATER = new Date('2026-10-26T10:00:00Z')
const EARLIER = new Date('2026-09-01T10:00:00Z')

test.group('readPlanTier', () => {
  test('un plan sans palier vaut le forfait complet', ({ assert }) => {
    // Les plans antérieurs aux paliers donnaient accès à tout : les lire
    // `basic` retirerait des fonctions à des abonnés en cours.
    assert.equal(readPlanTier(undefined), 'full')
    assert.equal(readPlanTier(null), 'full')
    assert.equal(readPlanTier('basic'), 'basic')
    assert.equal(readPlanTier('full'), 'full')
  })
})

test.group('resolvePlanAccess', () => {
  test('sans abonnement, le compte est inactif', ({ assert }) => {
    assert.isNull(resolvePlanAccess(null, NOW))
  })

  test('un abonnement actif ouvre son palier figé', ({ assert }) => {
    const base = { status: 'active' as const, is_trial: false, end_date: LATER }

    assert.equal(resolvePlanAccess({ ...base, plan_tier: 'basic' }, NOW), 'basic')
    assert.equal(resolvePlanAccess({ ...base, plan_tier: 'full' }, NOW), 'full')
  })

  test("un abonnement actif sans palier (historique) ouvre l'accès complet", ({ assert }) => {
    assert.equal(
      resolvePlanAccess({ status: 'active', is_trial: false, end_date: LATER }, NOW),
      'full'
    )
  })

  test("l'essai ouvre le forfait complet", ({ assert }) => {
    assert.equal(
      resolvePlanAccess({ status: 'trial', is_trial: true, plan_tier: null, end_date: LATER }, NOW),
      'full'
    )
  })

  test("un abonnement échu n'ouvre plus rien, même avant le passage du cron", ({ assert }) => {
    assert.isNull(
      resolvePlanAccess(
        { status: 'active', is_trial: false, plan_tier: 'full', end_date: EARLIER },
        NOW
      )
    )
    assert.isNull(resolvePlanAccess({ status: 'trial', is_trial: true, end_date: EARLIER }, NOW))
  })

  test("un abonnement `pending` (non payé) n'ouvre rien", ({ assert }) => {
    assert.isNull(
      resolvePlanAccess(
        { status: 'pending', is_trial: false, plan_tier: 'full', end_date: LATER },
        NOW
      )
    )
  })

  test("un abonnement annulé ou expiré n'ouvre rien", ({ assert }) => {
    for (const status of ['cancelled', 'expired'] as const) {
      assert.isNull(
        resolvePlanAccess({ status, is_trial: false, plan_tier: 'full', end_date: LATER }, NOW)
      )
    }
  })
})
