import { test } from '@japa/runner'

import { InitializeBookingPaymentUseCase } from '#features/booking_payments/use_cases/initialize_booking_payment.use_case'

const booking = {
  id: 'b1',
  client_id: 'c1',
  owner_id: 'o1',
  property_id: 'p1',
  status: 'confirmed',
  total_amount: 80000,
}

const pending = {
  id: 'pay-1',
  status: 'pending',
  payment_url: 'https://pay.wave.com/c/cos-old',
  provider_checkout_id: 'cos-old',
}

const openSession = {
  id: 'cos-old',
  checkout_status: 'open',
  payment_status: 'processing',
  wave_launch_url: 'https://pay.wave.com/c/cos-old',
  when_expires: new Date(Date.now() + 10 * 60 * 1000),
}

function useCase(options: {
  latest?: Record<string, unknown> | null
  pending?: Record<string, unknown> | null
  session?: Record<string, unknown> | null
  settled?: Record<string, unknown> | null
  /** Wave refuse de fermer la session (409 : payée à l'instant). */
  expireRefused?: boolean
  /** Issue constatée après un refus de fermeture. */
  settledAfterRefusal?: Record<string, unknown> | null
}) {
  const created: Array<Record<string, unknown>> = []
  const statuses: string[] = []
  let checkouts = 0
  let expired = 0
  let confirmations = 0

  const init = new InitializeBookingPaymentUseCase(
    { findById: async () => booking } as never,
    {
      findLatestByBooking: async () => options.latest ?? null,
      findPendingByBooking: async () => options.pending ?? null,
      create: async (input: Record<string, unknown>) => {
        created.push(input)
        return { id: 'pay-new', ...input }
      },
      updateStatus: async (_id: string, status: string) => {
        statuses.push(status)
        return null
      },
    } as never,
    {
      createCheckoutSession: async () => {
        checkouts++
        return { id: 'cos-new', wave_launch_url: 'https://pay.wave.com/c/cos-new' }
      },
      getCheckoutSession: async () => options.session ?? null,
      expireCheckoutSession: async () => {
        expired++
        return !options.expireRefused
      },
    } as never,
    {
      executeForBooking: async () =>
        confirmations++ === 0 ? (options.settled ?? null) : (options.settledAfterRefusal ?? null),
    } as never
  )

  return {
    init,
    created,
    statuses,
    checkouts: () => checkouts,
    expired: () => expired,
  }
}

test.group('InitializeBookingPaymentUseCase', () => {
  test('refuse un nouveau paiement si un paiement a réussi', async ({ assert }) => {
    const { init, checkouts } = useCase({ latest: { status: 'success' } })

    await assert.rejects(() => init.execute('b1', 'c1'), 'Cette réservation est déjà payée.')
    assert.equal(checkouts(), 0)
  })

  test('reprend une session encore payable', async ({ assert }) => {
    const { init, checkouts } = useCase({ pending, session: openSession })

    const result = await init.execute('b1', 'c1')
    assert.equal(result.payment_url, 'https://pay.wave.com/c/cos-old')
    assert.equal(checkouts(), 0)
  })

  test('une session échue est close et remplacée, sans lien mort', async ({ assert }) => {
    const { init, statuses, checkouts, expired } = useCase({
      pending,
      session: { ...openSession, when_expires: new Date(Date.now() - 60 * 1000) },
      settled: { status: 'pending' },
    })

    const result = await init.execute('b1', 'c1')
    assert.equal(result.payment_url, 'https://pay.wave.com/c/cos-new')
    assert.equal(expired(), 1)
    assert.deepEqual(statuses, ['expired'])
    assert.equal(checkouts(), 1)
  })

  test('fermeture refusée car payée à l’instant : constatée, jamais close', async ({ assert }) => {
    // Wave répond 409 à la fermeture d'une session payée entre la lecture et
    // la fermeture. La marquer expirée perdrait un paiement réel : le webhook
    // trouverait un paiement clos et ne créditerait rien.
    const { init, statuses, checkouts } = useCase({
      pending,
      session: { ...openSession, when_expires: new Date(Date.now() - 60 * 1000) },
      settled: { status: 'pending' },
      expireRefused: true,
      settledAfterRefusal: { status: 'success' },
    })

    await assert.rejects(() => init.execute('b1', 'c1'), 'Cette réservation est déjà payée.')
    assert.notInclude(statuses, 'expired')
    assert.equal(checkouts(), 0)
  })

  test('payée entre-temps : constatée, jamais repayée', async ({ assert }) => {
    const { init, checkouts } = useCase({
      pending,
      session: { ...openSession, checkout_status: 'complete', payment_status: 'succeeded' },
      settled: { status: 'success' },
    })

    await assert.rejects(() => init.execute('b1', 'c1'), 'Cette réservation est déjà payée.')
    assert.equal(checkouts(), 0)
  })

  test('n’envoie à Wave que les champs de l’API Checkout', async ({ assert }) => {
    let sent: Record<string, unknown> = {}
    const init = new InitializeBookingPaymentUseCase(
      { findById: async () => booking } as never,
      {
        findLatestByBooking: async () => null,
        findPendingByBooking: async () => null,
        create: async (input: Record<string, unknown>) => ({ id: 'pay-new', ...input }),
        updateStatus: async () => null,
      } as never,
      {
        createCheckoutSession: async (input: Record<string, unknown>) => {
          sent = input
          return { id: 'cos-new', wave_launch_url: 'https://pay.wave.com/c/cos-new' }
        },
      } as never,
      { executeForBooking: async () => null } as never
    )

    await init.execute('b1', 'c1')
    assert.notProperty(sent, 'metadata')
    assert.equal(sent.amount, 80000)
  })
})
