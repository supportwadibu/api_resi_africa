import { test } from '@japa/runner'

import { parseTrustProxy } from '#utils/trust_proxy'

test.group('parseTrustProxy', () => {
  test('sans valeur, seul loopback fait foi — le défaut d’AdonisJS', ({ assert }) => {
    const trust = parseTrustProxy(undefined)

    assert.isTrue(trust('127.0.0.1', 0))
    assert.isFalse(trust('10.0.0.5', 0))
  })

  test('un nombre désigne les derniers sauts comme proxys de confiance', ({ assert }) => {
    const trust = parseTrustProxy('1')

    assert.isTrue(trust('10.0.0.5', 0))
    assert.isFalse(trust('203.0.113.7', 1))
  })

  test('lit une liste de préréglages et de plages', ({ assert }) => {
    const trust = parseTrustProxy('loopback, uniquelocal, 198.51.100.0/24')

    assert.isTrue(trust('10.20.30.40', 0))
    assert.isTrue(trust('198.51.100.9', 0))
    assert.isFalse(trust('203.0.113.7', 0))
  })

  test('refuse « true », qui laisserait le client choisir son IP', ({ assert }) => {
    assert.throws(() => parseTrustProxy('true'), /toute adresse/)
    assert.throws(() => parseTrustProxy('*'), /toute adresse/)
  })

  test('refuse une liste invalide au démarrage', ({ assert }) => {
    assert.throws(() => parseTrustProxy('pas-une-ip'), /liste d'adresses valide/)
  })
})
