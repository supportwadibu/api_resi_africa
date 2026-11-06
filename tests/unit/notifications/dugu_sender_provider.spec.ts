import { test } from '@japa/runner'

import { ConsoleMessagingProvider } from '#services/notifications/messaging/console_provider'
import { DuguSenderProvider, toE164 } from '#services/notifications/messaging/dugu_sender_provider'
import { isHostedOtpProvider, MessagingError } from '#services/notifications/messaging/types'

/** `fetch` factice : note la requête reçue, répond le statut et le corps donnés. */
function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof fetch
  return { fetchFn, calls }
}

function duguError(code: string) {
  return { error: { code, message: 'refus' }, correlation_id: 'corr-1' }
}

const request = {
  to: '+2250700000000',
  channel: 'whatsapp',
  purpose: 'register',
  intent: 'verification_phone',
} as const

test.group('DuguSenderProvider — demande d’OTP', () => {
  test('poste la demande avec la clé, le projet et le canal forcé', async ({ assert }) => {
    const { fetchFn, calls } = fakeFetch(200, {
      data: {
        otp_id: 'otp_01',
        status: 'sent',
        channel: 'whatsapp',
        expires_at: '2026-11-05T10:05:00Z',
      },
    })
    const provider = new DuguSenderProvider({ apiKey: 'dsk_test_x', projectId: 'prj_1', fetchFn })

    const issued = await provider.requestOtp(request)

    assert.lengthOf(calls, 1)
    assert.equal(calls[0].url, 'https://dugusender.com/api/v1/otp/request')
    const headers = calls[0].init.headers as Record<string, string>
    assert.equal(headers.authorization, 'Bearer dsk_test_x')
    assert.equal(headers['x-project-id'], 'prj_1')
    assert.deepEqual(JSON.parse(calls[0].init.body as string), {
      subject: '+2250700000000',
      purpose: 'register',
      purpose_type: 'verification_phone',
      channel: 'whatsapp',
    })
    assert.deepEqual(issued, {
      externalId: 'otp_01',
      expiresAt: new Date('2026-11-05T10:05:00Z'),
      maxAttempts: 5,
      testCode: null,
    })
  })

  test('rend le code de test du sandbox', async ({ assert }) => {
    const { fetchFn } = fakeFetch(200, {
      data: {
        otp_id: 'otp_02',
        expires_at: '2026-11-05T10:05:00Z',
        sandbox: { test_code: '483921' },
      },
    })
    const provider = new DuguSenderProvider({ apiKey: 'dsk_test_x', fetchFn })

    const issued = await provider.requestOtp(request)

    assert.equal(issued.testCode, '483921')
  })

  test('sans projet configuré, n’envoie pas l’en-tête X-Project-Id', async ({ assert }) => {
    const { fetchFn, calls } = fakeFetch(200, { data: { otp_id: 'otp_03' } })
    const provider = new DuguSenderProvider({ apiKey: 'dsk_test_x', fetchFn })

    const issued = await provider.requestOtp(request)

    const headers = calls[0].init.headers as Record<string, string>
    assert.notProperty(headers, 'x-project-id')
    // Expiration absente de la réponse : repli sur les 300 s documentées.
    assert.isAbove(issued.expiresAt.getTime(), Date.now() + 290_000)
  })

  for (const code of [
    'destination_country_unresolved',
    'pricing_not_configured',
    'destination_not_permitted',
  ]) {
    test(`un refus de destination (${code}) est qualifié`, async ({ assert }) => {
      const { fetchFn } = fakeFetch(422, duguError(code))
      const provider = new DuguSenderProvider({ apiKey: 'dsk_test_x', fetchFn })

      const error = await provider.requestOtp(request).catch((e) => e)

      assert.instanceOf(error, MessagingError)
      assert.equal(error.kind, 'destination_unsupported')
    })
  }

  test('une clé refusée lève sans qualifier la destination', async ({ assert }) => {
    const { fetchFn } = fakeFetch(401, duguError('unauthenticated'))
    const provider = new DuguSenderProvider({ apiKey: 'dsk_test_x', fetchFn })

    const error = await provider.requestOtp(request).catch((e) => e)

    assert.instanceOf(error, MessagingError)
    assert.isUndefined(error.kind)
  })

  test('une réponse sans otp_id lève', async ({ assert }) => {
    const { fetchFn } = fakeFetch(200, { data: {} })
    const provider = new DuguSenderProvider({ apiKey: 'dsk_test_x', fetchFn })

    await assert.rejects(() => provider.requestOtp(request), /otp_id/)
  })

  test('une panne réseau devient une MessagingError', async ({ assert }) => {
    const fetchFn = (async () => {
      throw new Error('connect ECONNREFUSED')
    }) as unknown as typeof fetch
    const provider = new DuguSenderProvider({ apiKey: 'dsk_test_x', fetchFn })

    const error = await provider.requestOtp(request).catch((e) => e)

    assert.instanceOf(error, MessagingError)
  })
})

test.group('DuguSenderProvider — vérification', () => {
  test('poste l’identifiant et le code, 200 vaut succès', async ({ assert }) => {
    const { fetchFn, calls } = fakeFetch(200, { data: { otp_id: 'otp_01', status: 'verified' } })
    const provider = new DuguSenderProvider({ apiKey: 'dsk_test_x', fetchFn })

    const result = await provider.verifyOtp('otp_01', '483921')

    assert.equal(calls[0].url, 'https://dugusender.com/api/v1/otp/verify')
    assert.deepEqual(JSON.parse(calls[0].init.body as string), {
      otp_id: 'otp_01',
      code: '483921',
    })
    assert.deepEqual(result, { ok: true })
  })

  const refusals = [
    { status: 422, code: 'invalid_code', reason: 'invalid_code' },
    { status: 410, code: 'otp_expired', reason: 'expired' },
    { status: 429, code: 'max_attempts_exceeded', reason: 'max_attempts' },
    { status: 404, code: 'otp_not_found', reason: 'not_found' },
    { status: 409, code: 'otp_not_pending', reason: 'not_found' },
  ] as const

  for (const { status, code, reason } of refusals) {
    test(`${code} devient « ${reason} »`, async ({ assert }) => {
      const { fetchFn } = fakeFetch(status, duguError(code))
      const provider = new DuguSenderProvider({ apiKey: 'dsk_test_x', fetchFn })

      assert.deepEqual(await provider.verifyOtp('otp_01', '000000'), { ok: false, reason })
    })
  }

  test('une limite de débit lève au lieu de déclarer le code faux', async ({ assert }) => {
    const { fetchFn } = fakeFetch(429, duguError('rate_limited'))
    const provider = new DuguSenderProvider({ apiKey: 'dsk_test_x', fetchFn })

    await assert.rejects(() => provider.verifyOtp('otp_01', '483921'))
  })
})

test.group('DuguSenderProvider — contrat', () => {
  test('héberge ses codes, contrairement à la console', ({ assert }) => {
    assert.isTrue(isHostedOtpProvider(new DuguSenderProvider({ apiKey: 'dsk_test_x' })))
    assert.isFalse(isHostedOtpProvider(new ConsoleMessagingProvider()))
  })

  test('refuse l’envoi d’un texte composé par RESI', async ({ assert }) => {
    const provider = new DuguSenderProvider({ apiKey: 'dsk_test_x' })

    await assert.rejects(() => provider.send())
  })

  test('exige une clé', ({ assert }) => {
    assert.throws(() => new DuguSenderProvider({ apiKey: '' }))
  })

  test('ajoute le + de l’E.164 quand il manque', ({ assert }) => {
    assert.equal(toE164('2250700000000'), '+2250700000000')
    assert.equal(toE164(' +2250700000000 '), '+2250700000000')
  })
})
