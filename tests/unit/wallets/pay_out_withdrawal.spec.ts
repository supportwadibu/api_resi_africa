import { test } from '@japa/runner'

import {
  PAYOUT_RECHECK_AFTER_MS,
  PayOutWithdrawalUseCase,
  payoutKey,
  toWaveMobile,
} from '#features/wallets/use_cases/pay_out_withdrawal.use_case'
import { WaveApiError } from '#services/wave_client'

const NOW = new Date('2026-11-21T12:00:00Z')

function request(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'w1',
    owner_id: 'o1',
    wallet_id: 'wa1',
    net_amount: 255,
    payout_phone: '0769382758',
    status: 'processing',
    payout_attempt: 1,
    payout_started_at: new Date(NOW.getTime() - PAYOUT_RECHECK_AFTER_MS - 1000),
    payout_provider_id: null,
    processed_by: 'admin',
    ...overrides,
  }
}

function payout(status: string, extra: Record<string, unknown> = {}) {
  return {
    id: 'pt-1',
    status,
    receive_amount: '255',
    fee: '3',
    mobile: '+2250769382758',
    client_reference: 'resi-wd-w1-1',
    payout_error: null,
    ...extra,
  }
}

function useCase(options: {
  configured?: boolean
  start?: { request: Record<string, unknown>; changed: boolean } | null
  create?: () => Promise<unknown>
  getPayout?: unknown
  search?: unknown[]
  processing?: Array<Record<string, unknown>>
  claim?: boolean
}) {
  const calls = {
    created: [] as Array<{ input: Record<string, unknown>; key: string }>,
    paid: [] as Array<{ id: string; input: Record<string, unknown> }>,
    failed: [] as Array<{ id: string; attempt: number; error: unknown }>,
    providers: [] as Array<{ id: string; attempt: number; providerId: string }>,
    claims: [] as Array<{ id: string; attempt: number }>,
    notified: [] as string[],
  }
  const useCaseInstance = new PayOutWithdrawalUseCase(
    {
      startPayout: async () =>
        options.start === undefined ? { request: request(), changed: true } : options.start,
      recordPayoutProvider: async (id: string, attempt: number, providerId: string) =>
        void calls.providers.push({ id, attempt, providerId }),
      failPayout: async (id: string, attempt: number, error: unknown) => {
        calls.failed.push({ id, attempt, error })
        return true
      },
      claimPayoutCheck: async (id: string, attempt: number) => {
        calls.claims.push({ id, attempt })
        return options.claim ?? true
      },
      resolveWithdrawal: async (id: string, input: Record<string, unknown>) => {
        calls.paid.push({ id, input })
        return { request: request({ status: 'paid' }), changed: true }
      },
      findProcessingWithdrawals: async () => options.processing ?? [],
      findWithdrawalById: async () => request(),
    } as never,
    {
      isConfigured: () => options.configured ?? true,
      createPayout: async (input: Record<string, unknown>, key: string) => {
        calls.created.push({ input, key })
        return options.create ? options.create() : payout('succeeded')
      },
      getPayout: async () => options.getPayout ?? null,
      findByClientReference: async () => options.search ?? [],
    } as never,
    { toAdminDtos: async (requests: unknown[]) => requests } as never,
    {
      execute: async (userId: string) => {
        calls.notified.push(userId)
        return true
      },
    } as never
  )
  return { payOut: useCaseInstance, calls }
}

test.group('PayOutWithdrawalUseCase — versement', () => {
  test('succès : versé avec la référence Wave, propriétaire prévenu', async ({ assert }) => {
    const { payOut, calls } = useCase({})
    await payOut.execute('w1', 'admin')

    assert.deepEqual(calls.created[0].input, {
      receiveAmount: 255,
      currency: 'XOF',
      mobile: '+2250769382758',
      clientReference: 'resi-wd-w1-1',
      paymentReason: 'Retrait RESI',
    })
    assert.equal(calls.created[0].key, 'resi-wd-w1-1')
    assert.equal(calls.paid[0].input.payout_reference, 'pt-1')
    assert.equal(calls.paid[0].input.from, 'processing')
    assert.equal(calls.paid[0].input.attempt, 1)
    assert.deepEqual(calls.notified, ['o1'])
  })

  test('échec rendu par Wave : la demande rouvre, motif gardé', async ({ assert }) => {
    const { payOut, calls } = useCase({
      create: async () =>
        payout('failed', {
          payout_error: { code: 'recipient-limit-exceeded', message: 'Plafond atteint' },
        }),
    })
    await payOut.execute('w1', 'admin')

    assert.lengthOf(calls.paid, 0)
    assert.deepEqual(calls.failed[0].error, {
      code: 'recipient-limit-exceeded',
      message: 'Plafond atteint',
    })
  })

  test('refus certain (fonds insuffisants) : rouvre, rien n’est versé', async ({ assert }) => {
    const { payOut, calls } = useCase({
      create: async () => {
        throw new WaveApiError(400, 'insufficient-funds', 'Solde insuffisant')
      },
    })
    await payOut.execute('w1', 'admin')
    assert.equal((calls.failed[0].error as { code: string }).code, 'insufficient-funds')
  })

  test('réponse perdue : reste en cours, ni versé ni rouvert', async ({ assert }) => {
    const { payOut, calls } = useCase({
      create: async () => {
        throw new WaveApiError(0, 'network-error', 'Wave injoignable')
      },
    })
    await payOut.execute('w1', 'admin')
    assert.lengthOf(calls.paid, 0)
    assert.lengthOf(calls.failed, 0)
  })

  test('encore en traitement chez Wave : l’identifiant est gardé pour la relecture', async ({
    assert,
  }) => {
    const { payOut, calls } = useCase({ create: async () => payout('processing') })
    await payOut.execute('w1', 'admin')
    assert.deepEqual(calls.providers, [{ id: 'w1', attempt: 1, providerId: 'pt-1' }])
    assert.lengthOf(calls.paid, 0)
  })

  test('refus au code inconnu ou 409 : issue inconnue, jamais rouvert', async ({ assert }) => {
    for (const [status, code] of [
      [409, 'conflict'],
      [400, 'un-code-nouveau'],
      [400, 'idempotency-mismatch'],
    ] as const) {
      const { payOut, calls } = useCase({
        create: async () => {
          throw new WaveApiError(status, code, 'Refus')
        },
      })
      await payOut.execute('w1', 'admin')
      assert.lengthOf(calls.failed, 0, code)
      assert.lengthOf(calls.paid, 0, code)
    }
  })

  test('clé sans le droit Payout (403) : rouvert, avec un motif explicite', async ({ assert }) => {
    const { payOut, calls } = useCase({
      create: async () => {
        throw new WaveApiError(403, 'forbidden', 'Forbidden')
      },
    })
    await payOut.execute('w1', 'admin')

    const error = calls.failed[0].error as { code: string; message: string }
    assert.equal(error.code, 'forbidden')
    assert.include(error.message, 'droit « Payout »')
  })

  test('déjà en cours : 409, aucun envoi', async ({ assert }) => {
    const { payOut, calls } = useCase({
      start: { request: request({ status: 'processing' }), changed: false },
    })
    await assert.rejects(() => payOut.execute('w1', 'admin'), /déjà en cours/)
    assert.lengthOf(calls.created, 0)
  })

  test('sans clé Payout : 503, le versement manuel reste possible', async ({ assert }) => {
    const { payOut, calls } = useCase({ configured: false })
    await assert.rejects(() => payOut.execute('w1', 'admin'), /pas configuré/)
    assert.lengthOf(calls.created, 0)
  })
})

test.group('PayOutWithdrawalUseCase — relecture', () => {
  test('identifiant connu : relu chez Wave, sans nouvel envoi', async ({ assert }) => {
    const { payOut, calls } = useCase({
      processing: [request({ payout_provider_id: 'pt-1' })],
      getPayout: payout('succeeded'),
    })
    const result = await payOut.reconcile(NOW)

    assert.deepEqual(result, { checked: 1, settled: 1 })
    assert.lengthOf(calls.created, 0)
    assert.equal(calls.paid[0].input.payout_reference, 'pt-1')
  })

  test('identifiant inconnu : retrouvé par sa référence', async ({ assert }) => {
    const { payOut, calls } = useCase({
      processing: [request()],
      search: [payout('succeeded')],
    })
    await payOut.reconcile(NOW)
    assert.lengthOf(calls.created, 0)
    assert.lengthOf(calls.paid, 1)
  })

  test('introuvable chez Wave : rejoué avec la même clé', async ({ assert }) => {
    const { payOut, calls } = useCase({ processing: [request({ payout_attempt: 2 })] })
    await payOut.reconcile(NOW)
    assert.equal(calls.created[0].key, 'resi-wd-w1-2')
  })

  test('déjà réservé par un autre passage : ni relu ni rejoué', async ({ assert }) => {
    const { payOut, calls } = useCase({ processing: [request()], claim: false })
    const result = await payOut.reconcile(NOW)

    assert.deepEqual(result, { checked: 0, settled: 0 })
    assert.lengthOf(calls.created, 0)
  })

  test('la réservation porte la tentative en cours', async ({ assert }) => {
    const { payOut, calls } = useCase({ processing: [request({ payout_attempt: 3 })] })
    await payOut.reconcile(NOW)
    assert.deepEqual(calls.claims, [{ id: 'w1', attempt: 3 }])
    assert.equal(calls.created[0].key, 'resi-wd-w1-3')
  })

  test('lancé à l’instant : pas encore relu', async ({ assert }) => {
    const { payOut, calls } = useCase({
      processing: [request({ payout_started_at: new Date(NOW.getTime() - 1000) })],
    })
    const result = await payOut.reconcile(NOW)
    assert.equal(result.checked, 0)
    assert.lengthOf(calls.created, 0)
  })
})

test.group('versement Wave — formats', () => {
  test('numéro ivoirien mis au format international', ({ assert }) => {
    assert.equal(toWaveMobile('07 69 38 27 58'), '+2250769382758')
    assert.equal(toWaveMobile('2250769382758'), '+2250769382758')
    assert.equal(toWaveMobile('002250769382758'), '+2250769382758')
    assert.equal(toWaveMobile('+2250769382758'), '+2250769382758')
  })

  test('une clé par tentative', ({ assert }) => {
    assert.equal(payoutKey({ _id: 'w1', payout_attempt: 3 }), 'resi-wd-w1-3')
    assert.equal(payoutKey({ _id: 'w1' }), 'resi-wd-w1-1')
  })
})
