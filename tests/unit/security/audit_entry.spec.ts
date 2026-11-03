import { IncomingMessage } from 'node:http'
import { Socket } from 'node:net'

import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'

import AuditMiddleware from '#middleware/audit_middleware'
import type { AuditLogDocument } from '#models/audit_log'
import { auditOutcome, buildAuditEntry, describeFailure } from '#utils/audit_entry'

test.group('audit — issue et cause', () => {
  test("l'issue se déduit du statut", ({ assert }) => {
    assert.equal(auditOutcome(201), 'success')
    assert.equal(auditOutcome(302), 'success')
    assert.equal(auditOutcome(409), 'client_error')
    assert.equal(auditOutcome(500), 'server_error')
  })

  test('un refus garde le code et le message envoyés au client, sans pile', ({ assert }) => {
    const failure = describeFailure(
      409,
      { code: 'booking_conflict', message: 'Période déjà réservée.' },
      new Error('détail interne')
    )

    assert.deepEqual(failure, {
      code: 'booking_conflict',
      message: 'Période déjà réservée.',
      details: [],
      stack: null,
    })
  })

  test('une panne serveur garde le message réel et la pile, pas le texte générique', ({
    assert,
  }) => {
    const failure = describeFailure(
      500,
      { message: 'Internal Server Error' },
      new TypeError("Cannot read properties of undefined (reading 'id')")
    )

    assert.equal(failure.message, "Cannot read properties of undefined (reading 'id')")
    assert.isString(failure.stack)
  })

  test('une erreur de validation liste les champs refusés', ({ assert }) => {
    const error = Object.assign(new Error('Validation failure'), {
      code: 'E_VALIDATION_ERROR',
      messages: [
        { field: 'start_date', rule: 'date', message: '…' },
        { field: 'email', rule: 'email', message: '…' },
      ],
    })

    const failure = describeFailure(422, { errors: [] }, error)

    assert.equal(failure.code, 'E_VALIDATION_ERROR')
    assert.deepEqual(failure.details, ['start_date : date', 'email : email'])
  })
})

test.group('audit — entrée', () => {
  test("l'acteur est figé, la chaîne de requête jamais recopiée", async ({ assert }) => {
    const req = new IncomingMessage(new Socket())
    req.method = 'PATCH'
    req.url = '/api/v1/admin/withdrawals/w1/paid?secret=s3cr3t'
    const ctx = await testUtils.createHttpContext({ req })
    ctx.params = { id: 'w1' }
    ctx.authUser = {
      id: 'u1',
      full_name: 'Awa Koné',
      email: null,
      phone: '+2250700000000',
      role: 'admin',
      is_verified: true,
      is_active: true,
    }
    ctx.response.status(200)

    const now = new Date('2026-11-03T10:00:00Z')
    const entry = buildAuditEntry(ctx, { durationMs: 42, retentionDays: 10, now })

    assert.equal(entry.actor_id, 'u1')
    assert.deepEqual(entry.actor_snapshot, { full_name: 'Awa Koné', contact: '+2250700000000' })
    assert.equal(entry.method, 'PATCH')
    assert.equal(entry.path, '/api/v1/admin/withdrawals/w1/paid')
    assert.notInclude(JSON.stringify(entry), 's3cr3t')
    assert.deepEqual(entry.params, { id: 'w1' })
    assert.equal(entry.outcome, 'success')
    assert.isNull(entry.error)
    assert.equal(entry.expires_at.toISOString(), '2026-11-13T10:00:00.000Z')
  })

  test('une requête anonyme refusée reste tracée, avec sa cause', async ({ assert }) => {
    const ctx = await testUtils.createHttpContext()
    ctx.response.unauthorized({ code: 'missing_token', message: 'Token manquant.' })

    const entry = buildAuditEntry(ctx, { durationMs: 1, retentionDays: 180 })

    assert.isNull(entry.actor_id)
    assert.isNull(entry.actor_snapshot)
    assert.equal(entry.outcome, 'client_error')
    assert.equal(entry.error?.code, 'missing_token')
  })
})

test.group('AuditMiddleware', () => {
  test('trace aussi les lectures, avec la durée', async ({ assert }) => {
    const written: AuditLogDocument[] = []
    const middleware = new AuditMiddleware(async (entry) => {
      written.push(entry)
    })
    const ctx = await testUtils.createHttpContext()
    ctx.request.request.method = 'GET'

    await middleware.handle(ctx, async () => {
      ctx.response.ok({ data: [] })
    })

    assert.lengthOf(written, 1)
    assert.equal(written[0].method, 'GET')
    assert.isAtLeast(written[0].duration_ms, 0)
  })

  test("une panne d'écriture de la trace ne fait pas échouer la requête", async ({ assert }) => {
    const middleware = new AuditMiddleware(async () => {
      throw new Error('Firestore indisponible')
    })
    const ctx = await testUtils.createHttpContext()

    await middleware.handle(ctx, async () => {
      ctx.response.ok({})
    })

    assert.equal(ctx.response.getStatus(), 200)
  })

  test('ignore le prévol CORS', async ({ assert }) => {
    const written: AuditLogDocument[] = []
    const middleware = new AuditMiddleware(async (entry) => {
      written.push(entry)
    })
    const ctx = await testUtils.createHttpContext()
    ctx.request.request.method = 'OPTIONS'

    await middleware.handle(ctx, async () => {})

    assert.lengthOf(written, 0)
  })
})
