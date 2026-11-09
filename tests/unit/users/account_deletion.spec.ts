import { test } from '@japa/runner'
import {
  ACCOUNT_DELETION_GRACE_DAYS,
  accountDeletionNotices,
  purgeDate,
  type PendingObligations,
} from '#features/users/account_deletion'

const CLEAR: PendingObligations = {
  wallet_balance: 0,
  pending_withdrawals: 0,
  owner_ongoing_bookings: 0,
  client_ongoing_bookings: 0,
  sponsorship_balance: 0,
}

const codes = (notices: { code: string }[]) => notices.map((notice) => notice.code)

test.group('Suppression du compte par son titulaire', () => {
  test('un compte sans rien en suspens se supprime', ({ assert }) => {
    const { blockers, warnings } = accountDeletionNotices('proprio', CLEAR)
    assert.lengthOf(blockers, 0)
    assert.deepEqual(codes(warnings), ['owner_data'])
  })

  test("l'argent dû et les séjours chez le propriétaire bloquent", ({ assert }) => {
    const { blockers } = accountDeletionNotices('proprio', {
      ...CLEAR,
      wallet_balance: 15000,
      pending_withdrawals: 1,
      owner_ongoing_bookings: 2,
    })
    assert.deepEqual(codes(blockers), [
      'wallet_balance',
      'pending_withdrawals',
      'owner_ongoing_bookings',
    ])
    // `Intl` sépare les milliers par une espace fine insécable.
    assert.match(blockers[0].message, /15\s000 FCFA/)
    assert.include(blockers[2].message, '2 séjours')
  })

  test('les séjours du voyageur et le parrainage ne font que prévenir', ({ assert }) => {
    const { blockers, warnings } = accountDeletionNotices('client', {
      ...CLEAR,
      client_ongoing_bookings: 1,
      sponsorship_balance: 500,
    })
    assert.lengthOf(blockers, 0)
    assert.deepEqual(codes(warnings), [
      'client_ongoing_bookings',
      'sponsorship_balance',
      'client_data',
    ])
  })

  test('la purge tombe après le délai de grâce', ({ assert }) => {
    const now = new Date('2026-11-08T10:00:00Z')
    const days = (purgeDate(now).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    assert.equal(days, ACCOUNT_DELETION_GRACE_DAYS)
  })
})
