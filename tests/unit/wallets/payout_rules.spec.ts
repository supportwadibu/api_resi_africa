import { test } from '@japa/runner'

import {
  MAX_PAYOUT_NUMBERS,
  normalizePayoutNumbers,
  quoteWithdrawal,
} from '#features/wallets/wallet_rules'

test.group('minimum de retrait configuré', () => {
  test('le minimum réglé au backoffice remplace celui par défaut', ({ assert }) => {
    assert.throws(() => quoteWithdrawal(4000, 10000, 0, 5000), 'Le retrait minimal est de 5000 F.')
    assert.equal(quoteWithdrawal(5000, 10000, 0, 5000).net_amount, 4950)
  })
})

test.group('numéros de retrait Wave', () => {
  test('deux numéros au plus, rangés par position', ({ assert }) => {
    const numbers = normalizePayoutNumbers([
      { slot: 2, phone: '05 00 00 00 02', holder_name: '  Awa ' },
      { slot: 1, phone: '+225 07-00-00-00-01' },
    ])
    assert.deepEqual(numbers, [
      { slot: 1, phone: '+2250700000001', holder_name: null },
      { slot: 2, phone: '0500000002', holder_name: 'Awa' },
    ])
    assert.equal(MAX_PAYOUT_NUMBERS, 2)
  })

  test('refuse une position en double', ({ assert }) => {
    assert.throws(() =>
      normalizePayoutNumbers([
        { slot: 1, phone: '0700000001' },
        { slot: 1, phone: '0700000002' },
      ])
    )
  })

  test('refuse deux fois le même numéro', ({ assert }) => {
    assert.throws(() =>
      normalizePayoutNumbers([
        { slot: 1, phone: '07 00 00 00 01' },
        { slot: 2, phone: '0700000001' },
      ])
    )
  })

  test('refuse un numéro illisible', ({ assert }) => {
    assert.throws(() => normalizePayoutNumbers([{ slot: 1, phone: 'abc' }]))
  })
})
