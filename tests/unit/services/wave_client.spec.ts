import crypto from 'node:crypto'

import { test } from '@japa/runner'

import {
  WaveApiError,
  isSessionPayable,
  parseWaveError,
  signWaveRequest,
  toCheckoutSession,
  toPaymentDomainError,
  verifyWaveSignature,
} from '#services/wave_client'

const SECRET = 'wave_sn_AKS_test'

test.group('signWaveRequest', () => {
  test('signe l’horodatage suivi du corps exact, comme la doc Wave', ({ assert }) => {
    const body = '{"amount": "1000", "currency": "XOF"}'
    const expected = crypto.createHmac('sha256', SECRET).update(`1639081943${body}`).digest('hex')

    assert.equal(signWaveRequest(SECRET, body, 1639081943), `t=1639081943,v1=${expected}`)
  })

  test('un GET signe l’horodatage seul', ({ assert }) => {
    const expected = crypto.createHmac('sha256', SECRET).update('1639081943').digest('hex')
    assert.equal(signWaveRequest(SECRET, '', 1639081943), `t=1639081943,v1=${expected}`)
  })

  test('relue par la vérification des webhooks, même schéma', ({ assert }) => {
    const now = new Date(1639081943 * 1000)
    const header = signWaveRequest(SECRET, '{"a":1}', 1639081943)
    assert.isTrue(verifyWaveSignature(SECRET, '{"a":1}', header, now))
  })
})

test.group('parseWaveError', () => {
  test('lit le corps d’erreur de l’API', ({ assert }) => {
    const error = parseWaveError(400, {
      code: 'request-validation-error',
      message: 'Request invalid',
      details: [{ loc: ['amount'], msg: 'field required' }],
    })
    assert.equal(error.code, 'request-validation-error')
    assert.isFalse(error.isTransient)
    assert.isNotNull(error.details)
  })

  test('lit le corps imbriqué du filtrage d’IP', ({ assert }) => {
    const error = parseWaveError(403, {
      error: { code: 'ip-not-allowed', message: 'not in allowlist', httpcode: 403 },
    })
    assert.equal(error.code, 'ip-not-allowed')
  })

  test('un corps illisible garde le statut', ({ assert }) => {
    const error = parseWaveError(503, null)
    assert.equal(error.code, 'http-503')
    assert.isTrue(error.isTransient)
  })
})

test.group('toPaymentDomainError', () => {
  test('un remboursement refusé se distingue d’une panne', ({ assert }) => {
    const refused = toPaymentDomainError(new WaveApiError(400, 'checkout-refund-failed', 'x'))
    assert.equal(refused.code, 'payment_refund_failed')

    const outage = toPaymentDomainError(new WaveApiError(0, 'network-error', 'x'))
    assert.equal(outage.code, 'payment_provider_unavailable')
  })
})

test.group('isSessionPayable', () => {
  const base = toCheckoutSession({
    id: 'cos-1',
    amount: '1000',
    currency: 'XOF',
    checkout_status: 'open',
    payment_status: 'processing',
    wave_launch_url: 'https://pay.wave.com/c/cos-1',
    when_expires: '2026-10-20T10:30:00Z',
  })

  test('ouverte et non échue : payable', ({ assert }) => {
    assert.isTrue(isSessionPayable(base, new Date('2026-10-20T10:10:00Z')))
  })

  test('au-delà de when_expires, même encore ouverte : plus payable', ({ assert }) => {
    assert.isFalse(isSessionPayable(base, new Date('2026-10-20T10:31:00Z')))
  })

  test('close : plus payable', ({ assert }) => {
    assert.isFalse(
      isSessionPayable({ ...base, checkout_status: 'expired' }, new Date('2026-10-20T10:10:00Z'))
    )
  })

  test('lit la raison du dernier refus', ({ assert }) => {
    const session = toCheckoutSession({
      id: 'cos-2',
      last_payment_error: { code: 'insufficient-funds', message: 'Solde insuffisant' },
    })
    assert.equal(session.last_payment_error?.code, 'insufficient-funds')
  })
})
