import crypto from 'node:crypto'

import { test } from '@japa/runner'

import { checkoutIdOf, verifyWaveSignature } from '#services/wave_subscription_service'

const SECRET = 'wave_sn_WHS_test'
const BODY = '{"id":"EV_1","type":"checkout.session.completed","data":{"id":"cos-1"}}'
const NOW = new Date('2026-09-26T10:00:00Z')
const TIMESTAMP = String(Math.floor(NOW.getTime() / 1000))

function sign(secret: string, timestamp: string, body: string) {
  return crypto
    .createHmac('sha256', secret)
    .update(timestamp + body)
    .digest('hex')
}

test.group('verifyWaveSignature', () => {
  test('accepte une signature calculée sur horodatage + corps brut', ({ assert }) => {
    const header = `t=${TIMESTAMP},v1=${sign(SECRET, TIMESTAMP, BODY)}`

    assert.isTrue(verifyWaveSignature(SECRET, BODY, header, NOW))
  })

  test('accepte la seconde signature pendant une rotation du secret', ({ assert }) => {
    const header = `t=${TIMESTAMP},v1=${sign('ancien', TIMESTAMP, BODY)},v1=${sign(SECRET, TIMESTAMP, BODY)}`

    assert.isTrue(verifyWaveSignature(SECRET, BODY, header, NOW))
  })

  test('refuse un corps modifié', ({ assert }) => {
    const header = `t=${TIMESTAMP},v1=${sign(SECRET, TIMESTAMP, BODY)}`

    assert.isFalse(verifyWaveSignature(SECRET, BODY.replace('cos-1', 'cos-2'), header, NOW))
  })

  test('refuse un webhook rejoué au-delà de cinq minutes', ({ assert }) => {
    const header = `t=${TIMESTAMP},v1=${sign(SECRET, TIMESTAMP, BODY)}`
    const later = new Date(NOW.getTime() + 6 * 60 * 1000)

    assert.isFalse(verifyWaveSignature(SECRET, BODY, header, later))
  })

  test('lit la session dans data.id, jamais l’identifiant d’événement', ({ assert }) => {
    assert.equal(checkoutIdOf(JSON.parse(BODY)), 'cos-1')
    assert.isNull(checkoutIdOf({ id: 'EV_1' }))
  })

  test('refuse un en-tête absent ou mal formé', ({ assert }) => {
    assert.isFalse(verifyWaveSignature(SECRET, BODY, undefined, NOW))
    assert.isFalse(verifyWaveSignature(SECRET, BODY, 'sha256=abc', NOW))
    assert.isFalse(verifyWaveSignature(SECRET, BODY, `t=${TIMESTAMP}`, NOW))
  })
})
