import { test } from '@japa/runner'

import NotificationService from '#services/notification_service'
import { buildMailProvider } from '#services/notifications/mail_factory'
import {
  ConsoleMailProvider,
  MailError,
  type MailMessage,
  type MailProvider,
  UnconfiguredMailProvider,
} from '#services/notifications/mail_provider'
import { ResendMailProvider } from '#services/notifications/resend_mail_provider'

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

const message: MailMessage = {
  to: 'awa@example.com',
  subject: 'Sujet',
  text: 'Texte',
  html: '<p>Texte</p>',
}

test.group('ResendMailProvider', () => {
  test('poste l’email avec la clé et l’expéditeur configurés', async ({ assert }) => {
    const { fetchFn, calls } = fakeFetch(200, { id: 'email-1' })
    const provider = new ResendMailProvider({
      apiKey: 're_test',
      from: 'Resi <no-reply@resi.ci>',
      replyTo: 'support@resi.ci',
      fetchFn,
    })

    await provider.send(message)

    assert.lengthOf(calls, 1)
    assert.equal(calls[0].url, 'https://api.resend.com/emails')
    const headers = calls[0].init.headers as Record<string, string>
    assert.equal(headers.authorization, 'Bearer re_test')
    assert.deepEqual(JSON.parse(calls[0].init.body as string), {
      from: 'Resi <no-reply@resi.ci>',
      to: ['awa@example.com'],
      subject: 'Sujet',
      text: 'Texte',
      html: '<p>Texte</p>',
      reply_to: 'support@resi.ci',
    })
  })

  test('un refus de Resend lève avec sa raison', async ({ assert }) => {
    const { fetchFn } = fakeFetch(403, {
      statusCode: 403,
      name: 'validation_error',
      message: 'The resi.ci domain is not verified.',
    })
    const provider = new ResendMailProvider({ apiKey: 're_test', from: 'a@resi.ci', fetchFn })

    try {
      await provider.send(message)
      assert.fail('un refus doit lever')
    } catch (error) {
      assert.instanceOf(error, MailError)
      assert.include((error as Error).message, 'HTTP 403')
      assert.include((error as Error).message, 'domain is not verified')
    }
  })

  test('une panne réseau lève une MailError', async ({ assert }) => {
    const fetchFn = (async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch
    const provider = new ResendMailProvider({ apiKey: 're_test', from: 'a@resi.ci', fetchFn })

    await assert.rejects(() => provider.send(message), /Resend injoignable/)
  })
})

test.group('buildMailProvider', () => {
  test('console par défaut hors production', ({ assert }) => {
    assert.instanceOf(buildMailProvider({ inProduction: false }), ConsoleMailProvider)
  })

  test('refuse la console en production', ({ assert }) => {
    // La console « réussit » sans rien envoyer : en production, l'inscription
    // attendrait un code qui ne part jamais.
    assert.throws(() => buildMailProvider({ inProduction: true }), /production/)
    assert.throws(
      () => buildMailProvider({ provider: 'console', inProduction: true }),
      /production/
    )
  })

  test('resend exige la clé et l’expéditeur', ({ assert }) => {
    assert.throws(
      () => buildMailProvider({ provider: 'resend', from: 'a@resi.ci', inProduction: true }),
      /RESEND_API_KEY/
    )
    assert.throws(
      () => buildMailProvider({ provider: 'resend', resendApiKey: 're_x', inProduction: true }),
      /MAIL_FROM/
    )
    const provider = buildMailProvider({
      provider: 'resend',
      resendApiKey: 're_x',
      from: 'a@resi.ci',
      inProduction: true,
    })
    assert.equal(provider.name, 'resend')
  })

  test('rejette un fournisseur inconnu', ({ assert }) => {
    assert.throws(() => buildMailProvider({ provider: 'mailgun', inProduction: false }), /inconnu/)
  })
})

test.group('UnconfiguredMailProvider', () => {
  test('fait échouer l’envoi au lieu de le simuler', async ({ assert }) => {
    const provider = new UnconfiguredMailProvider('RESEND_API_KEY manquante')
    await assert.rejects(() => provider.send(), /RESEND_API_KEY manquante/)
  })
})

test.group('NotificationService.sendOtp — email', (group) => {
  const sent: MailMessage[] = []
  const capture: MailProvider = {
    name: 'capture',
    async send(m) {
      sent.push(m)
    },
  }

  group.each.setup(() => {
    sent.length = 0
    NotificationService.setMailProvider(capture)
    return () => NotificationService.setMailProvider(new ConsoleMailProvider())
  })

  test('le code figure dans le corps, jamais dans l’objet', async ({ assert }) => {
    // L'objet s'affiche sur l'écran verrouillé.
    await NotificationService.sendOtp({
      channel: 'email',
      target: 'awa@example.com',
      code: '482913',
      purpose: 'register',
    })

    assert.lengthOf(sent, 1)
    assert.equal(sent[0].to, 'awa@example.com')
    assert.notInclude(sent[0].subject, '482913')
    assert.include(sent[0].text, '482913')
    assert.include(sent[0].html ?? '', '482913')
  })

  test('un échec du fournisseur remonte à l’appelant', async ({ assert }) => {
    NotificationService.setMailProvider(new UnconfiguredMailProvider('test'))
    await assert.rejects(() =>
      NotificationService.sendOtp({
        channel: 'email',
        target: 'awa@example.com',
        code: '482913',
        purpose: 'register',
      })
    )
  })

  test('l’inscription passe par le template de vérification', async ({ assert }) => {
    await NotificationService.sendOtp({
      channel: 'email',
      target: 'awa@example.com',
      code: '482913',
      purpose: 'register',
    })

    assert.deepEqual(sent[0].template, {
      id: 'otp_email_verification',
      variables: { ttl_minutes: 10, code: '482913', email: 'awa@example.com' },
    })
  })

  test('les autres codes gardent le HTML, le template parle d’inscription', async ({ assert }) => {
    await NotificationService.sendOtp({
      channel: 'email',
      target: 'awa@example.com',
      code: '482913',
      purpose: 'reset',
    })

    assert.isUndefined(sent[0].template)
  })
})

test.group('NotificationService.sendEmailVerified', (group) => {
  const sent: MailMessage[] = []

  group.each.setup(() => {
    sent.length = 0
    NotificationService.setMailProvider({
      name: 'capture',
      async send(m) {
        sent.push(m)
      },
    })
    return () => NotificationService.setMailProvider(new ConsoleMailProvider())
  })

  test('envoie le template de confirmation à l’adresse vérifiée', async ({ assert }) => {
    await NotificationService.sendEmailVerified({ to: 'awa@example.com' })

    assert.lengthOf(sent, 1)
    assert.equal(sent[0].to, 'awa@example.com')
    assert.equal(sent[0].template?.id, 'email_verified')
    assert.equal(sent[0].template?.variables.email, 'awa@example.com')
  })
})

test.group('ResendMailProvider — template', () => {
  test('envoie le template sans html ni texte, que Resend refuserait', async ({ assert }) => {
    const { fetchFn, calls } = fakeFetch(200, { id: 'email-2' })
    const provider = new ResendMailProvider({ apiKey: 're_test', from: 'a@resi.ci', fetchFn })

    await provider.send({
      ...message,
      template: { id: 'otp_email_verification', variables: { code: '482913' } },
    })

    const body = JSON.parse(calls[0].init.body as string)
    assert.deepEqual(body.template, {
      id: 'otp_email_verification',
      variables: { code: '482913' },
    })
    assert.notProperty(body, 'html')
    assert.notProperty(body, 'text')
  })
})
