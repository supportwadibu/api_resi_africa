import { test } from '@japa/runner'

import { WaveTestCheckoutUseCase } from '#features/wave_test/use_cases/wave_test_checkout.use_case'
import { WaveApiError } from '#services/wave_client'

const session = {
  id: 'cos-test',
  amount: '100',
  currency: 'XOF',
  checkout_status: 'open',
  payment_status: 'processing',
  client_reference: 'TEST-x',
  transaction_id: null,
  wave_launch_url: 'https://pay.wave.com/c/cos-test',
  when_expires: new Date('2026-10-22T12:30:00Z'),
  last_payment_error: null,
}

function useCase(wave: Record<string, unknown> = {}) {
  const sent: Array<Record<string, unknown>> = []
  const tester = new WaveTestCheckoutUseCase(
    {
      createCheckoutSession: async (input: Record<string, unknown>) => {
        sent.push(input)
        return session
      },
      getCheckoutSession: async () => session,
      refundCheckoutSession: async () => undefined,
      expireCheckoutSession: async () => true,
      ...wave,
    } as never,
    {
      appUrl: 'https://api.resi.test',
      currency: 'XOF',
      apiKey: 'wave_ci_prod_secret',
      signingSecret: undefined,
      webhookSecret: 'wave_sn_WHS_secret',
      baseUrl: undefined,
    }
  )
  return { tester, sent }
}

test.group('WaveTestCheckoutUseCase', () => {
  test('ouvre une session marquée TEST, retours https sur l’API', async ({ assert }) => {
    const { tester, sent } = useCase()
    const result = await tester.start({ amount: 100 })

    assert.match(sent[0].clientReference as string, /^TEST-/)
    assert.equal(sent[0].amount, 100)
    assert.equal(sent[0].currency, 'XOF')
    assert.equal(
      sent[0].successUrl,
      'https://api.resi.test/api/v1/payments/wave/test/return?outcome=success'
    )
    assert.equal(
      sent[0].errorUrl,
      'https://api.resi.test/api/v1/payments/wave/test/return?outcome=error'
    )
    assert.equal(result.checkout_id, 'cos-test')
    assert.equal(result.wave_launch_url, 'https://pay.wave.com/c/cos-test')
  })

  test('une erreur Wave remonte avec son code, pour le diagnostic', async ({ assert }) => {
    const { tester } = useCase({
      createCheckoutSession: async () => {
        throw new WaveApiError(401, 'missing-signature', 'Request signature is missing')
      },
    })

    try {
      await tester.start({ amount: 100 })
      assert.fail('erreur attendue')
    } catch (error) {
      const domain = error as { code: string; message: string; status: number }
      assert.equal(domain.code, 'wave_error')
      assert.include(domain.message, 'missing-signature')
      assert.equal(domain.status, 502)
    }
  })

  test('session inconnue : 404', async ({ assert }) => {
    const { tester } = useCase({ getCheckoutSession: async () => null })
    await assert.rejects(() => tester.status('cos-x'), 'Session Wave introuvable.')
  })

  test('la configuration dit ce qui est renseigné, jamais les valeurs', ({ assert }) => {
    const { tester } = useCase()
    const config = tester.config()

    assert.deepEqual(config, {
      api_key: true,
      api_signing_secret: false,
      webhook_secret: true,
      base_url: 'https://api.wave.com',
      currency: 'XOF',
      app_url: 'https://api.resi.test',
      app_url_is_https: true,
      webhook_url: 'https://api.resi.test/api/v1/payments/wave/webhook',
    })
    assert.notInclude(JSON.stringify(config), 'wave_ci_prod_secret')
    assert.notInclude(JSON.stringify(config), 'wave_sn_WHS_secret')
  })
})
