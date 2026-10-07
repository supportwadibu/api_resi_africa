import { test } from '@japa/runner'

import { planTokenMirror } from '#models/device_token'

test.group('planTokenMirror', () => {
  test('un appareil neuf s’ajoute à la fiche du compte', ({ assert }) => {
    assert.deepEqual(planTokenMirror(null, 'owner-1'), [{ user_id: 'owner-1', op: 'add' }])
  })

  test('une reconnexion du même compte reste un ajout idempotent', ({ assert }) => {
    assert.deepEqual(planTokenMirror({ user_id: 'owner-1' }, 'owner-1'), [
      { user_id: 'owner-1', op: 'add' },
    ])
  })

  test('un téléphone qui change de compte quitte la fiche du précédent', ({ assert }) => {
    // Sans ce retrait, le premier compte garderait sur sa fiche un appareil
    // qui ne reçoit plus ses notifications.
    assert.deepEqual(planTokenMirror({ user_id: 'owner-1' }, 'owner-2'), [
      { user_id: 'owner-1', op: 'remove' },
      { user_id: 'owner-2', op: 'add' },
    ])
  })

  test('un appareil retiré quitte la fiche de son compte', ({ assert }) => {
    assert.deepEqual(planTokenMirror({ user_id: 'owner-1' }, null), [
      { user_id: 'owner-1', op: 'remove' },
    ])
  })

  test('rien à retirer pour un appareil inconnu', ({ assert }) => {
    assert.deepEqual(planTokenMirror(null, null), [])
  })
})
