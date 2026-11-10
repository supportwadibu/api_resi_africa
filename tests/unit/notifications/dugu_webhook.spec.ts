import crypto from 'node:crypto'

import { test } from '@japa/runner'

import { verifyDuguSignature } from '#services/notifications/messaging/dugu_webhook'

const SECRET = 'whsec_dugu_test'
const BODY = '{"event":"otp.failed","data":{"otp_id":"otp_1"}}'
const NOW = new Date('2026-11-10T10:00:00Z')
const TIMESTAMP = String(Math.floor(NOW.getTime() / 1000))

function sign(secret: string, timestamp: string, body: string) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
}

test.group('verifyDuguSignature', () => {
  test('accepte une signature calculée sur horodatage + "." + corps brut', ({ assert }) => {
    const header = `t=${TIMESTAMP},v1=${sign(SECRET, TIMESTAMP, BODY)}`

    assert.isTrue(verifyDuguSignature(SECRET, BODY, header, NOW))
  })

  test('refuse le schéma Wave, sans point entre horodatage et corps', ({ assert }) => {
    const waveLike = crypto
      .createHmac('sha256', SECRET)
      .update(TIMESTAMP + BODY)
      .digest('hex')

    assert.isFalse(verifyDuguSignature(SECRET, BODY, `t=${TIMESTAMP},v1=${waveLike}`, NOW))
  })

  test('accepte la seconde signature pendant une rotation du secret', ({ assert }) => {
    const header = `t=${TIMESTAMP},v1=${sign('ancien', TIMESTAMP, BODY)},v1=${sign(SECRET, TIMESTAMP, BODY)}`

    assert.isTrue(verifyDuguSignature(SECRET, BODY, header, NOW))
  })

  test('accepte un horodatage en millisecondes', ({ assert }) => {
    const ms = String(NOW.getTime())
    const header = `t=${ms},v1=${sign(SECRET, ms, BODY)}`

    assert.isTrue(verifyDuguSignature(SECRET, BODY, header, NOW))
  })

  test('refuse un corps modifié', ({ assert }) => {
    const header = `t=${TIMESTAMP},v1=${sign(SECRET, TIMESTAMP, BODY)}`

    assert.isFalse(verifyDuguSignature(SECRET, BODY.replace('otp_1', 'otp_2'), header, NOW))
  })

  test('refuse une livraison rejouée au-delà de cinq minutes', ({ assert }) => {
    const header = `t=${TIMESTAMP},v1=${sign(SECRET, TIMESTAMP, BODY)}`
    const later = new Date(NOW.getTime() + 6 * 60 * 1000)

    assert.isFalse(verifyDuguSignature(SECRET, BODY, header, later))
  })

  test('refuse un en-tête absent ou mal formé', ({ assert }) => {
    assert.isFalse(verifyDuguSignature(SECRET, BODY, undefined, NOW))
    assert.isFalse(verifyDuguSignature(SECRET, BODY, 'sha256=abc', NOW))
    assert.isFalse(verifyDuguSignature(SECRET, BODY, `t=${TIMESTAMP}`, NOW))
    assert.isFalse(verifyDuguSignature(SECRET, BODY, `t=abc,v1=${'0'.repeat(64)}`, NOW))
  })
})
