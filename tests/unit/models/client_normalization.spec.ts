import { test } from '@japa/runner'
import { normalizePhone } from '#models/client'

test.group('normalizePhone', () => {
  test('supprime les espaces et séparateurs', ({ assert }) => {
    assert.equal(normalizePhone('07 12 34 56 78'), '0712345678')
    assert.equal(normalizePhone('07-12-34-56-78'), '0712345678')
    assert.equal(normalizePhone('07.12.34.56.78'), '0712345678')
  })

  test('conserve l’indicatif international', ({ assert }) => {
    assert.equal(normalizePhone('+225 07 12 34 56 78'), '+2250712345678')
  })

  test('un numéro déjà normalisé est inchangé', ({ assert }) => {
    assert.equal(normalizePhone('0712345678'), '0712345678')
  })

  test('les parenthèses sont retirées', ({ assert }) => {
    assert.equal(normalizePhone('(225) 0712345678'), '2250712345678')
  })
})
