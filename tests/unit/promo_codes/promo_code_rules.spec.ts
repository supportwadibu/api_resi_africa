import { test } from '@japa/runner'

import { assertPromoCodeCoherent } from '#features/promo_codes/use_cases/promo_code_rules'
import { DomainError } from '#utils/domain_error'

function codeOf(fn: () => void): string | null {
  try {
    fn()
    return null
  } catch (error) {
    return error instanceof DomainError ? error.code : 'erreur_inattendue'
  }
}

test.group('assertPromoCodeCoherent', () => {
  test('refuse un pourcentage supérieur à 100', ({ assert }) => {
    // Au-delà, la remise dépasserait le séjour et le total deviendrait négatif.
    assert.equal(
      codeOf(() =>
        assertPromoCodeCoherent({
          type: 'percentage',
          value: 120,
          starts_at: null,
          expires_at: null,
        })
      ),
      'invalid_promo_value'
    )
  })

  test('accepte un montant fixe supérieur à 100', ({ assert }) => {
    assert.isNull(
      codeOf(() =>
        assertPromoCodeCoherent({ type: 'fixed', value: 5000, starts_at: null, expires_at: null })
      )
    )
  })

  test('refuse une expiration antérieure au début', ({ assert }) => {
    assert.equal(
      codeOf(() =>
        assertPromoCodeCoherent({
          type: 'fixed',
          value: 5000,
          starts_at: new Date('2026-10-01'),
          expires_at: new Date('2026-09-01'),
        })
      ),
      'invalid_promo_period'
    )
  })

  test('accepte une période ouverte d’un côté', ({ assert }) => {
    assert.isNull(
      codeOf(() =>
        assertPromoCodeCoherent({
          type: 'percentage',
          value: 10,
          starts_at: null,
          expires_at: new Date('2026-12-31'),
        })
      )
    )
  })
})
