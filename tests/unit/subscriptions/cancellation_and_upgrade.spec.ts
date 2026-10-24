import { test } from '@japa/runner'

import {
  buildPaidSubscription,
  dailyValueOf,
  isRenewable,
  remainingPaidDays,
  unusedValue,
  upgradeQuote,
} from '#features/subscriptions/subscription_checkout'
import { quoteWithdrawal } from '#features/wallets/wallet_rules'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-10-24T10:00:00Z')
const inDays = (days: number) => new Date(NOW.getTime() + days * DAY)

test.group('remboursement au prorata', () => {
  test('rend les jours non entamés, au franc inférieur', ({ assert }) => {
    // 5 000 F pour 30 jours, 16 jours pleins restants : 5 000 × 16 / 30.
    const subscription = { amount: 5000, end_date: inDays(16.5), daily_value: 5000 / 30 }

    assert.equal(remainingPaidDays(subscription.end_date, NOW), 16)
    assert.equal(unusedValue(subscription, 30, NOW), 2666)
  })

  test('le jour en cours compte comme consommé', ({ assert }) => {
    // Résilié le soir même du paiement : la journée entamée n'est pas rendue.
    assert.equal(remainingPaidDays(inDays(29.6), NOW), 29)
  })

  test('un abonnement échu ne rend rien', ({ assert }) => {
    assert.equal(unusedValue({ amount: 5000, end_date: inDays(-1) }, 30, NOW), 0)
  })

  test('l’historique sans valeur journalière se déduit du montant et de la durée', ({ assert }) => {
    assert.equal(dailyValueOf({ amount: 3000 }, 30), 100)
    // Plan illisible : 30 jours, la durée de tous les forfaits vendus.
    assert.equal(dailyValueOf({ amount: 3000 }, null), 100)
  })
})

test.group('montée de forfait', () => {
  test('le prix est réduit de la valeur des jours restants', ({ assert }) => {
    // Pro à 3 000 F / 30 j, 10 jours restants : 1 000 F de crédit.
    const current = { amount: 3000, end_date: inDays(10.2), daily_value: 100 }

    assert.deepEqual(upgradeQuote(current, 30, 5000, NOW), { credit: 1000, amount: 4000 })
  })

  test('la période d’une montée vaut le prix plein, crédit réintégré', ({ assert }) => {
    const { subscription, close } = buildPaidSubscription(
      {
        user_id: 'u1',
        plan_id: 'pro_plus',
        plan_tier: 'pro_plus',
        duration_days: 30,
        amount: 4000,
        transaction_reference: 'SUB-1',
        upgrade_credit: 1000,
      },
      {
        _id: 'sub_pro',
        status: 'active',
        is_trial: false,
        plan_tier: 'pro',
        end_date: inDays(10),
      },
      NOW
    )

    // Pas de report des jours de l'ancien forfait : ils sont déjà déduits.
    assert.equal(subscription.end_date.getTime(), inDays(30).getTime())
    assert.approximately(subscription.daily_value!, 5000 / 30, 1e-9)
    assert.deepEqual(close, { id: 'sub_pro', status: 'cancelled', reason: 'upgraded' })
  })
})

test.group('renouvellement', () => {
  test('ouvert à 7 jours de l’échéance, pas avant', ({ assert }) => {
    const base = { status: 'active' as const, is_trial: false, plan_tier: 'pro' as const }

    assert.isFalse(isRenewable({ ...base, end_date: inDays(20) }, NOW))
    assert.isTrue(isRenewable({ ...base, end_date: inDays(6) }, NOW))
  })

  test('sans forfait payant, rien n’empêche de souscrire', ({ assert }) => {
    assert.isTrue(isRenewable(null, NOW))
    assert.isTrue(isRenewable({ status: 'trial', is_trial: true, end_date: inDays(10) }, NOW))
  })
})

test.group('retrait d’un remboursement', () => {
  test('la part remboursée sort sans frais', ({ assert }) => {
    // 2 666 F remboursés sur un solde de 12 666 F : seuls 7 334 F paient 1 %.
    assert.deepEqual(quoteWithdrawal(10000, 12666, 2666), {
      amount: 10000,
      fee: 74,
      net_amount: 9926,
      fee_free_amount: 2666,
    })
  })

  test('un retrait couvert par le remboursement ne paie rien', ({ assert }) => {
    assert.deepEqual(quoteWithdrawal(2000, 2666, 2666), {
      amount: 2000,
      fee: 0,
      net_amount: 2000,
      fee_free_amount: 2000,
    })
  })
})
