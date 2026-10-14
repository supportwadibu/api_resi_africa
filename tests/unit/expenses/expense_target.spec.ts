import { test } from '@japa/runner'

import { resolveExpenseTarget } from '#features/expenses/expense_target'
import { DomainError } from '#utils/domain_error'

/** `assert.throws` ne rend rien : le `code` resterait hors de portée. */
function captureDomainError(fn: () => unknown): DomainError {
  try {
    fn()
  } catch (error) {
    if (error instanceof DomainError) return error
    throw error
  }

  throw new Error('aucune erreur levée')
}

test.group('resolveExpenseTarget', () => {
  test('une charge de logement est rattachée au bien', ({ assert }) => {
    const target = resolveExpenseTarget({ property_id: 'studio-1' })

    assert.equal(target.kind, 'property')
    assert.equal(target.property_id, 'studio-1')
    assert.isNull(target.residence_id)
  })

  test('une charge commune est rattachée à la résidence', ({ assert }) => {
    const target = resolveExpenseTarget({ residence_id: 'resi-adja' })

    assert.equal(target.kind, 'residence')
    assert.equal(target.residence_id, 'resi-adja')
    assert.isNull(target.property_id)
  })

  test('les deux rattachements à la fois sont refusés', ({ assert }) => {
    // Avec les deux, un relevé de résidence compterait la dépense deux fois :
    // une fois par son unité, une fois par le lieu.
    const error = captureDomainError(() =>
      resolveExpenseTarget({ property_id: 'studio-1', residence_id: 'resi-adja' })
    )

    assert.equal(error.code, 'ambiguous_expense_target')
    assert.equal(error.status, 422)
  })

  test('aucun rattachement est refusé', ({ assert }) => {
    // Sans cible, la dépense pèserait sur le bénéfice global tout en étant
    // absente de tout relevé.
    const error = captureDomainError(() => resolveExpenseTarget({}))

    assert.equal(error.code, 'expense_target_required')
    assert.equal(error.status, 422)
  })

  test('une chaîne vide vaut absence de rattachement', ({ assert }) => {
    // Un formulaire sans sélection envoie couramment `''` plutôt que d'omettre
    // la clé : le traiter comme un identifiant produirait une dépense
    // rattachée à un bien inexistant.
    const error = captureDomainError(() => resolveExpenseTarget({ property_id: '   ' }))

    assert.equal(error.code, 'expense_target_required')
  })

  test('une chaîne vide sur un des deux ne rend pas ambigu', ({ assert }) => {
    const target = resolveExpenseTarget({ property_id: '', residence_id: 'resi-adja' })

    assert.equal(target.kind, 'residence')
  })

  test('un null explicite vaut absence', ({ assert }) => {
    // Le cas de la bascule : effacer `property_id` en posant `residence_id`.
    const target = resolveExpenseTarget({ property_id: null, residence_id: 'resi-adja' })

    assert.equal(target.kind, 'residence')
    assert.isNull(target.property_id)
  })

  test('les identifiants sont débarrassés de leurs espaces', ({ assert }) => {
    const target = resolveExpenseTarget({ property_id: '  studio-1  ' })

    assert.equal(target.property_id, 'studio-1')
  })
})
