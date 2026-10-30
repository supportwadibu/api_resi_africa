import { test } from '@japa/runner'

import {
  DEFAULT_SPONSORSHIP_SETTINGS,
  assertRedemption,
  buildSponsorshipCode,
  computeReward,
  isWithinAttachWindow,
  normalizeSponsorshipCode,
  resolveSponsorshipSettings,
  rewardAvailableAt,
} from '#features/sponsorships/sponsorship_rules'
import { sponsorshipCreditOf } from '#features/booking_payments/sponsorship_credit'

const DAY = 24 * 60 * 60 * 1000

test.group('gain de parrainage', () => {
  test('un gain fixe ne dépend pas du montant payé', ({ assert }) => {
    const rule = { mode: 'fixed' as const, value: 100, max_amount: null, hold_days: 0 }
    assert.equal(computeReward(rule, 15000), 100)
    assert.equal(computeReward(rule, 300000), 100)
  })

  test('un gain en pourcentage est arrondi au franc inférieur et plafonné', ({ assert }) => {
    const rule = { mode: 'percent' as const, value: 2.5, max_amount: 1000, hold_days: 0 }
    assert.equal(computeReward(rule, 15999), 399)
    assert.equal(computeReward(rule, 100000), 1000)
    assert.equal(computeReward({ ...rule, max_amount: null }, 100000), 2500)
  })

  test('rien de payé, rien de gagné — même en mode fixe', ({ assert }) => {
    const rule = { mode: 'fixed' as const, value: 1000, max_amount: null, hold_days: 0 }
    assert.equal(computeReward(rule, 0), 0)
    assert.equal(computeReward({ ...rule, value: 0 }, 50000), 0)
  })

  test('le délai d’attente repousse la disponibilité', ({ assert }) => {
    const now = new Date('2026-10-30T10:00:00Z')
    assert.equal(rewardAvailableAt(now, 0).getTime(), now.getTime())
    assert.equal(rewardAvailableAt(now, 14).getTime(), now.getTime() + 14 * DAY)
  })
})

test.group('code de parrainage', () => {
  test('la saisie est ramenée à sa forme canonique', ({ assert }) => {
    assert.equal(normalizeSponsorshipCode(' kof-7q2m '), 'KOF7Q2M')
    assert.isNull(normalizeSponsorshipCode('ab'))
    assert.isNull(normalizeSponsorshipCode('KOF7Q2M!'))
    assert.isNull(normalizeSponsorshipCode(null))
  })

  test('le code reprend le nom, sans accent, puis quatre signes lisibles', ({ assert }) => {
    const code = buildSponsorshipCode('Élodie Koné', () => 0)
    assert.equal(code, 'ELOAAAA')
    assert.match(buildSponsorshipCode('Jean', Math.random), /^JEA[A-HJ-NP-Z2-9]{4}$/)
  })

  test('un nom sans lettre latine garde un préfixe', ({ assert }) => {
    assert.equal(buildSponsorshipCode('李', () => 0).slice(0, 3), 'RES')
  })
})

test.group('demande sur les gains', () => {
  const rule = { minimum_amount: 5000, options: ['withdrawal' as const, 'stay_credit' as const] }

  test('accepte une demande au seuil, dans le solde', ({ assert }) => {
    assert.doesNotThrow(() =>
      assertRedemption({ type: 'withdrawal', amount: 5000, role: 'client', balance: 5200, rule })
    )
  })

  test('refuse sous le seuil', ({ assert }) => {
    assert.throws(
      () =>
        assertRedemption({
          type: 'stay_credit',
          amount: 4900,
          role: 'client',
          balance: 9000,
          rule,
        }),
      'Vos gains sont utilisables à partir de 5000 F.'
    )
  })

  test('refuse au-delà du solde, négatif compris', ({ assert }) => {
    assert.throws(() =>
      assertRedemption({ type: 'withdrawal', amount: 6000, role: 'client', balance: 5500, rule })
    )
    assert.throws(() =>
      assertRedemption({ type: 'withdrawal', amount: 5000, role: 'client', balance: -100, rule })
    )
  })

  test('refuse un usage fermé au rôle', ({ assert }) => {
    assert.throws(() =>
      assertRedemption({
        type: 'subscription_credit',
        amount: 5000,
        role: 'client',
        balance: 9000,
        rule,
      })
    )
  })
})

test.group('réglages du parrainage', () => {
  test('sans document, les gains sont coupés', ({ assert }) => {
    assert.deepEqual(resolveSponsorshipSettings(null), DEFAULT_SPONSORSHIP_SETTINGS)
    assert.isFalse(resolveSponsorshipSettings(undefined).enabled)
  })

  test('un champ absent prend sa valeur par défaut', ({ assert }) => {
    const settings = resolveSponsorshipSettings({
      enabled: true,
      rewards: { client: { value: 250 } },
    })
    assert.isTrue(settings.enabled)
    assert.equal(settings.rewards.client.value, 250)
    assert.equal(settings.rewards.client.mode, 'fixed')
    assert.deepEqual(settings.rewards.proprio, DEFAULT_SPONSORSHIP_SETTINGS.rewards.proprio)
  })

  test('un usage hors du rôle est écarté', ({ assert }) => {
    const settings = resolveSponsorshipSettings({
      redemption: { client: { options: ['withdrawal', 'subscription_credit'] } },
    })
    assert.deepEqual(settings.redemption.client.options, ['withdrawal'])
  })

  test('le délai de saisie d’un code se compte depuis l’inscription', ({ assert }) => {
    const createdAt = new Date('2026-10-01T00:00:00Z')
    assert.isTrue(isWithinAttachWindow(createdAt, new Date('2026-10-30T00:00:00Z'), 30))
    assert.isFalse(isWithinAttachWindow(createdAt, new Date('2026-11-01T00:00:01Z'), 30))
  })
})

test.group('crédit séjour porté par un paiement', () => {
  test('lit le crédit figé, 0 sur l’historique', ({ assert }) => {
    assert.equal(sponsorshipCreditOf({ metadata: { sponsorship_credit_amount: 7500 } }), 7500)
    assert.equal(sponsorshipCreditOf({ metadata: { booking_id: 'b1' } }), 0)
    assert.equal(sponsorshipCreditOf({}), 0)
    assert.equal(sponsorshipCreditOf({ metadata: { sponsorship_credit_amount: '7500' } }), 0)
  })
})
