import { test } from '@japa/runner'

import { assertSameExpenseAuthor } from '#features/expenses/use_cases/create_expense.use_case'
import { expenseRequestDocId, withDefaults } from '#models/expense'
import type { ExpenseRecord } from '#models/expense'

/**
 * Une dépense saisie hors ligne part de la file de synchronisation, qui la
 * rejoue après un timeout : sans idempotence, le rejeu la compterait deux fois
 * dans les charges du mois.
 */
test.group('idempotence des dépenses', () => {
  test('client_request_id descend jusqu’au document', ({ assert }) => {
    const payload = withDefaults({ owner_id: 'owner-1', client_request_id: 'req-1' })

    assert.equal(payload.client_request_id, 'req-1')
  })

  test('une dépense saisie en ligne n’en porte pas', ({ assert }) => {
    assert.isNull(withDefaults({ owner_id: 'owner-1' }).client_request_id)
  })

  test('l’identifiant dérivé est stable pour un même propriétaire et une même requête', ({
    assert,
  }) => {
    assert.equal(expenseRequestDocId('owner-1', 'req-1'), expenseRequestDocId('owner-1', 'req-1'))
  })

  test('l’identifiant dérivé diffère d’un propriétaire à l’autre', ({ assert }) => {
    // Sans le propriétaire dans le condensat, un identifiant de requête deviné
    // désignerait la dépense d'un autre compte.
    assert.notEqual(
      expenseRequestDocId('owner-1', 'req-1'),
      expenseRequestDocId('owner-2', 'req-1')
    )
  })

  test('l’identifiant dérivé ne garde aucun caractère refusé par Firestore', ({ assert }) => {
    assert.match(expenseRequestDocId('owner-1', 'a/b.c'), /^[0-9a-f]{64}$/)
  })

  test('le rejeu par le même auteur rend la dépense existante', ({ assert }) => {
    assert.doesNotThrow(() => assertSameExpenseAuthor(existing('gerant-1'), 'gerant-1'))
    assert.doesNotThrow(() => assertSameExpenseAuthor(existing(null), undefined))
  })

  test('un identifiant de requête réemployé par un autre auteur est refusé', ({ assert }) => {
    assert.throws(() => assertSameExpenseAuthor(existing('gerant-1'), 'gerant-2'))
    assert.throws(() => assertSameExpenseAuthor(existing(null), 'gerant-2'))
  })
})

function existing(createdBy: string | null): ExpenseRecord {
  return {
    ...withDefaults({ owner_id: 'owner-1', client_request_id: 'req-1', created_by: createdBy }),
    _id: expenseRequestDocId('owner-1', 'req-1'),
  }
}
