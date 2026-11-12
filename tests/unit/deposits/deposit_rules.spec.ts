import { test } from '@japa/runner'

import {
  assertValidDepositSettings,
  assertValidPropertyDeposit,
  depositAmountFor,
  depositBookingFields,
  effectiveDepositRule,
  ownerBalanceDue,
  resolveDepositSettings,
} from '#features/deposits/deposit_rules'
import { extensionCommission } from '#features/commissions/commission_rules'

const resiRule = { enabled: true, owner_can_set: false, type: 'percent' as const, value: 30 }

test.group('réglage de l’acompte', () => {
  test('coupé tant que le backoffice n’a rien enregistré', ({ assert }) => {
    assert.isNull(effectiveDepositRule(resolveDepositSettings(null), null))
  })

  test('refuse un acompte nul, un pourcentage de 100 et un fixe décimal', ({ assert }) => {
    assert.throws(() => assertValidDepositSettings({ ...resiRule, value: 0 }))
    assert.throws(() => assertValidDepositSettings({ ...resiRule, value: 100 }))
    assert.throws(() => assertValidDepositSettings({ ...resiRule, type: 'fixed', value: 10000.5 }))
    assert.doesNotThrow(() => assertValidDepositSettings(resiRule))
  })

  test('un logement qui refuse l’acompte n’a pas à porter de montant', ({ assert }) => {
    assert.doesNotThrow(() =>
      assertValidPropertyDeposit({ enabled: false, type: 'percent', value: 0 })
    )
    assert.throws(() => assertValidPropertyDeposit({ enabled: true, type: 'percent', value: 0 }))
  })

  test('RESI impose sa règle tant qu’il ne laisse pas la main au propriétaire', ({ assert }) => {
    const own = { enabled: true, type: 'fixed' as const, value: 5000 }
    assert.deepEqual(effectiveDepositRule(resiRule, own), { type: 'percent', value: 30 })
  })

  test('le propriétaire règle le sien quand RESI le permet', ({ assert }) => {
    const settings = { ...resiRule, owner_can_set: true }
    assert.deepEqual(
      effectiveDepositRule(settings, { enabled: true, type: 'fixed', value: 5000 }),
      {
        type: 'fixed',
        value: 5000,
      }
    )
    // Refusé sur ce logement : paiement total seulement.
    assert.isNull(effectiveDepositRule(settings, { enabled: false, type: 'fixed', value: 5000 }))
    // Jamais réglé : la règle de RESI sert de repli.
    assert.deepEqual(effectiveDepositRule(settings, null), { type: 'percent', value: 30 })
  })
})

test.group('montant de l’acompte', () => {
  test('applique la règle à ce que paie le client', ({ assert }) => {
    assert.equal(depositAmountFor({ type: 'percent', value: 30 }, 100000, 10000), 30000)
    assert.equal(depositAmountFor({ type: 'fixed', value: 20000 }, 100000, 10000), 20000)
  })

  test('ne descend jamais sous la part de RESI', ({ assert }) => {
    assert.equal(depositAmountFor({ type: 'percent', value: 5 }, 100000, 10000), 10000)
  })

  test('n’est plus proposé quand il atteindrait le prix du séjour', ({ assert }) => {
    assert.isNull(depositAmountFor({ type: 'fixed', value: 150000 }, 100000, 10000))
    assert.isNull(depositAmountFor(null, 100000, 10000))
  })

  test('fige la part du propriétaire, part de RESI retenue en entier', ({ assert }) => {
    // Séjour : 90 000 F au propriétaire, 100 000 F payés par le client.
    const fields = depositBookingFields('deposit', { type: 'percent', value: 30 }, 100000, 90000)
    assert.deepEqual(fields, {
      payment_option: 'deposit',
      online_deposit_amount: 30000,
      deposit_owner_amount: 20000,
    })
    // Reste au comptoir : 70 000 F, vu du client comme du propriétaire.
    assert.equal(ownerBalanceDue({ total_amount: 90000, prepaid_amount: 20000 }), 70000)
  })

  test('un code promo plus généreux que la commission revient au propriétaire', ({ assert }) => {
    // Le client paie 85 000 F, le propriétaire touche 90 000 F : RESI offre 5 000 F.
    const fields = depositBookingFields('deposit', { type: 'percent', value: 30 }, 85000, 90000)
    assert.equal(fields.online_deposit_amount, 25500)
    assert.equal(fields.deposit_owner_amount, 30500)
  })

  test('refuse l’acompte là où il n’est pas proposé', ({ assert }) => {
    assert.throws(() => depositBookingFields('deposit', null, 100000, 90000), /totalité/)
    assert.deepEqual(depositBookingFields('full', null, 100000, 90000), { payment_option: 'full' })
  })

  test('le reste dû déduit l’acompte en ligne et le versé au comptoir', ({ assert }) => {
    assert.equal(
      ownerBalanceDue({ total_amount: 90000, prepaid_amount: 20000, deposit_amount: 70000 }),
      0
    )
    // Historique : ni versement en ligne ni prix convenu, le total en tient lieu.
    assert.equal(ownerBalanceDue({ total_amount: 30000 }), 30000)
  })
})

test.group('commission des jours ajoutés au comptoir', () => {
  test('suit la règle figée sur la réservation', ({ assert }) => {
    assert.equal(extensionCommission({ mode: 'percent', value: 10 }, 40000, 2), 4000)
    assert.equal(extensionCommission({ mode: 'fixed', value: 1500 }, 40000, 2), 3000)
  })

  test('rien sans commission ni jours ajoutés', ({ assert }) => {
    assert.equal(extensionCommission(null, 40000, 2), 0)
    assert.equal(extensionCommission({ mode: 'percent', value: 10 }, 0, 0), 0)
  })
})
