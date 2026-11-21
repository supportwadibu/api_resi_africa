import { test } from '@japa/runner'

import { markWithdrawalPaidValidator } from '#validators/wallet/wallet'
import {
  normalizePayoutReference,
  ResolveWithdrawalUseCase,
} from '#features/wallets/use_cases/resolve_withdrawal.use_case'

function useCase(taken: { _id: string } | null = null) {
  const resolved: Array<{ id: string; input: Record<string, unknown> }> = []
  const notified: string[] = []
  const resolve = new ResolveWithdrawalUseCase(
    { toAdminDtos: async (requests: unknown[]) => requests } as never,
    {
      findWithdrawalByPayoutReference: async () => taken,
      resolveWithdrawal: async (id: string, input: Record<string, unknown>) => {
        resolved.push({ id, input })
        return {
          request: { _id: id, owner_id: 'o1', net_amount: 990, payout_phone: '07', ...input },
          changed: true,
        }
      },
    } as never,
    {
      execute: async (userId: string) => {
        notified.push(userId)
        return true
      },
    } as never
  )
  return { resolve, resolved, notified }
}

test.group('ResolveWithdrawalUseCase — versement', () => {
  test('la référence Wave est consignée, sous sa forme canonique', async ({ assert }) => {
    const { resolve, resolved } = useCase()
    await resolve.execute('w1', 'admin', { status: 'paid', payout_reference: ' t_ab 12cd ' })
    assert.equal(resolved[0].input.payout_reference, 'T_AB12CD')
  })

  test('une référence déjà utilisée pour un autre retrait est refusée', async ({ assert }) => {
    const { resolve, resolved } = useCase({ _id: 'w-autre' })
    await assert.rejects(
      () => resolve.execute('w1', 'admin', { status: 'paid', payout_reference: 'T_AB12CD' }),
      /déjà servi/
    )
    assert.lengthOf(resolved, 0)
  })

  test('un refus ne demande aucune référence et ne notifie pas', async ({ assert }) => {
    const { resolve, resolved, notified } = useCase({ _id: 'w-autre' })
    await resolve.execute('w1', 'admin', { status: 'rejected', rejection_reason: 'Numéro faux' })
    assert.isNull(resolved[0].input.payout_reference)
    assert.lengthOf(notified, 0)
  })

  test('versé : le propriétaire est prévenu', async ({ assert }) => {
    const { resolve, notified } = useCase()
    await resolve.execute('w1', 'admin', { status: 'paid', payout_reference: 'T_AB12CD' })
    assert.deepEqual(notified, ['o1'])
  })
})

test.group('markWithdrawalPaidValidator', () => {
  test('sans référence Wave, « Versé » est refusé', async ({ assert }) => {
    await assert.rejects(() => markWithdrawalPaidValidator.validate({}))
    await assert.rejects(() => markWithdrawalPaidValidator.validate({ payout_reference: 'abc' }))
  })

  test('une référence plausible passe', async ({ assert }) => {
    const payload = await markWithdrawalPaidValidator.validate({ payout_reference: 'T_AB12CD34' })
    assert.equal(payload.payout_reference, 'T_AB12CD34')
  })
})

test.group('normalizePayoutReference', () => {
  test('retire les espaces et met en majuscules', ({ assert }) => {
    assert.equal(normalizePayoutReference('t_ab 12\tcd'), 'T_AB12CD')
  })
})
