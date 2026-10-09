import { test } from '@japa/runner'
import { errors } from '@vinejs/vine'

import { googleSignupRole } from '#auth/use_cases/auth/google_login.use_case'
import { googleLoginValidator } from '#validators/auth/auth'

const idToken = 'x'.repeat(40)

test.group('Connexion Google — rôle à la création', () => {
  test('sans rôle demandé, le compte naît propriétaire', ({ assert }) => {
    // Comportement historique de l'application propriétaire, qui n'envoie rien.
    assert.equal(googleSignupRole(undefined), 'proprio')
  })

  test('l’app client obtient un compte client', ({ assert }) => {
    assert.equal(googleSignupRole('client'), 'client')
  })

  test('le validateur refuse admin', async ({ assert }) => {
    await assert.rejects(
      () => googleLoginValidator.validate({ id_token: idToken, role_name: 'admin' }),
      errors.E_VALIDATION_ERROR
    )
  })

  test('le validateur accepte l’absence de rôle', async ({ assert }) => {
    const payload = await googleLoginValidator.validate({ id_token: idToken })
    assert.isUndefined(payload.role_name)
  })
})
