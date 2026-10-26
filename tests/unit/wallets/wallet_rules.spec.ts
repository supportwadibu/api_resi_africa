import { test } from '@japa/runner'

import { computeWithdrawalFee, quoteWithdrawal, walletIdFor } from '#features/wallets/wallet_rules'

test.group('walletIdFor', () => {
  test('un portefeuille par résidence, un général pour les biens autonomes', ({ assert }) => {
    assert.equal(walletIdFor('o1', 'r1'), 'residence_r1')
    assert.equal(walletIdFor('o1', null), 'owner_o1')
  })
})

test.group('computeWithdrawalFee', () => {
  test('1 %, arrondi au franc supérieur', ({ assert }) => {
    assert.equal(computeWithdrawalFee(10000), 100)
    assert.equal(computeWithdrawalFee(1050), 11)
  })
})

test.group('quoteWithdrawal', () => {
  test('débite le montant demandé, verse le net', ({ assert }) => {
    assert.deepEqual(quoteWithdrawal(10000, 25000), {
      amount: 10000,
      fee: 100,
      net_amount: 9900,
      fee_free_amount: 0,
    })
  })

  test('refuse un retrait au-dessus du solde', ({ assert }) => {
    assert.throws(() => quoteWithdrawal(30000, 25000), /Solde insuffisant/)
  })

  test('refuse un retrait sous le minimum', ({ assert }) => {
    assert.throws(() => quoteWithdrawal(500, 25000), /minimal/)
  })
})
