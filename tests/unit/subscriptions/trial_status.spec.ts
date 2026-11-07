import { test } from '@japa/runner'

import { trialStatus } from '#features/subscriptions/trial_status'

const NOW = new Date('2026-11-07T10:00:00Z')
const EARLIER = new Date('2026-11-01T10:00:00Z')
const LATER = new Date('2026-11-20T10:00:00Z')

const trial = (patch: Record<string, unknown> = {}) => ({
  is_trial: true,
  status: 'trial' as const,
  plan_tier: 'pro' as const,
  end_date: LATER,
  ...patch,
})
const paid = (patch: Record<string, unknown> = {}) => ({
  is_trial: false,
  status: 'active' as const,
  plan_tier: 'pro' as const,
  end_date: LATER,
  ...patch,
})

test.group('trialStatus — choix du palier', () => {
  test('un propriétaire jamais abonné doit choisir le palier de son essai', ({ assert }) => {
    for (const ownerStatus of ['pending', 'active']) {
      assert.isTrue(trialStatus([], ownerStatus, NOW).trial_choice_required)
    }
  })

  test("un compte rejeté, suspendu ou sans fiche n'a rien à choisir", ({ assert }) => {
    for (const ownerStatus of ['rejected', 'suspended', null]) {
      assert.isFalse(trialStatus([], ownerStatus, NOW).trial_choice_required)
    }
  })

  test('un essai ou un abonnement, présent ou passé, clôt le choix', ({ assert }) => {
    assert.isFalse(trialStatus([trial()], 'pending', NOW).trial_choice_required)
    assert.isFalse(trialStatus([paid({ status: 'expired' })], 'active', NOW).trial_choice_required)
  })
})

test.group('trialStatus — essai terminé', () => {
  test('un essai en cours ne se termine pas', ({ assert }) => {
    assert.isNull(trialStatus([trial()], 'active', NOW).ended_trial_tier)
  })

  test('un essai échu donne le palier essayé, même avant le passage du cron', ({ assert }) => {
    assert.equal(trialStatus([trial({ end_date: EARLIER })], 'active', NOW).ended_trial_tier, 'pro')
    assert.equal(
      trialStatus([trial({ status: 'expired', plan_tier: 'pro_plus' })], 'active', NOW)
        .ended_trial_tier,
      'pro_plus'
    )
  })

  test('un essai échu ouvert avant le choix du palier vaut Pro+', ({ assert }) => {
    assert.equal(
      trialStatus([trial({ status: 'expired', plan_tier: null })], 'active', NOW).ended_trial_tier,
      'pro_plus'
    )
  })

  test("un abonnement souscrit après l'essai clôt la fin d'essai", ({ assert }) => {
    for (const status of ['active', 'pending', 'expired', 'cancelled']) {
      const history = [paid({ status }), trial({ status: 'expired' })]
      assert.isNull(trialStatus(history, 'active', NOW).ended_trial_tier)
    }
  })

  test("sans essai dans l'historique, rien à annoncer", ({ assert }) => {
    assert.isNull(trialStatus([], 'active', NOW).ended_trial_tier)
  })
})
