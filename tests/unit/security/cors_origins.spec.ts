import { test } from '@japa/runner'

import { parseCorsOrigins } from '#utils/cors_origins'

test.group('parseCorsOrigins', () => {
  test('sans valeur, aucune origine n’est autorisée', ({ assert }) => {
    assert.deepEqual(parseCorsOrigins(undefined), [])
    assert.deepEqual(parseCorsOrigins(''), [])
    assert.deepEqual(parseCorsOrigins(' , '), [])
  })

  test('lit une liste séparée par des virgules, espaces compris', ({ assert }) => {
    assert.deepEqual(parseCorsOrigins('https://app.resi.ci, http://localhost:3000'), [
      'https://app.resi.ci',
      'http://localhost:3000',
    ])
  })

  test('tolère la barre finale, que l’en-tête Origin ne porte pas', ({ assert }) => {
    assert.deepEqual(parseCorsOrigins('https://app.resi.ci/'), ['https://app.resi.ci'])
  })

  test('refuse le joker, qui ouvrirait l’API à tout navigateur', ({ assert }) => {
    assert.throws(() => parseCorsOrigins('*'), /joker/)
    assert.throws(() => parseCorsOrigins('https://app.resi.ci,*'), /joker/)
  })

  test('refuse une URL à chemin, qui ne correspondrait à aucune origine', ({ assert }) => {
    assert.throws(() => parseCorsOrigins('https://app.resi.ci/admin'), /chemin/)
  })

  test('refuse une valeur qui n’est pas une origine web', ({ assert }) => {
    assert.throws(() => parseCorsOrigins('app.resi.ci'), /origine valide/)
    assert.throws(() => parseCorsOrigins('ftp://app.resi.ci'), /http ou https/)
  })
})
