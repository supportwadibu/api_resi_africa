import { test } from '@japa/runner'

import { resetChannel, resetRefusal } from '#auth/helpers/password_reset'

const ACTIVE = { is_verified: true, is_active: true, is_deleted: false, purge_scheduled_at: null }

test.group('Réinitialisation du mot de passe', () => {
  test('un compte vérifié et actif peut recevoir un code', ({ assert }) => {
    assert.isNull(resetRefusal(ACTIVE))
  })

  test('un compte inconnu est refusé', ({ assert }) => {
    assert.equal(resetRefusal(null), 'user_not_found')
  })

  test('une inscription non vérifiée doit d’abord être finie', ({ assert }) => {
    assert.equal(resetRefusal({ ...ACTIVE, is_verified: false }), 'account_not_verified')
  })

  test('un compte désactivé ne se rouvre pas par ce détour', ({ assert }) => {
    assert.equal(resetRefusal({ ...ACTIVE, is_active: false }), 'account_disabled')
    assert.equal(
      resetRefusal({ ...ACTIVE, is_active: false, is_deleted: true }),
      'account_disabled'
    )
  })

  test('une suppression demandée est signalée comme telle', ({ assert }) => {
    const pending = {
      ...ACTIVE,
      is_active: false,
      is_deleted: true,
      purge_scheduled_at: new Date(),
    }
    assert.equal(resetRefusal(pending), 'account_deletion_pending')
  })

  test('le canal suit l’identifiant, comme à la connexion', ({ assert }) => {
    assert.equal(resetChannel('awa@example.com'), 'email')
    assert.equal(resetChannel('+2250700000000'), 'phone')
  })
})
