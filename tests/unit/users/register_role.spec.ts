import { test } from '@japa/runner'
import { errors } from '@vinejs/vine'

import { registerInitValidator } from '#validators/auth/auth'

const base = {
  full_name: 'Awa Koné',
  auth_channel: 'email',
  email: 'awa@example.com',
  password: 'motdepasse1',
  password_confirmation: 'motdepasse1',
}

test.group('registerInitValidator — rôle', () => {
  test('refuse role_name admin', async ({ assert }) => {
    await assert.rejects(
      () => registerInitValidator.validate({ ...base, role_name: 'admin' }),
      errors.E_VALIDATION_ERROR
    )
  })

  test('accepte client et proprio', async ({ assert }) => {
    const client = await registerInitValidator.validate({ ...base, role_name: 'client' })
    const proprio = await registerInitValidator.validate({ ...base, role_name: 'proprio' })
    assert.equal(client.role_name, 'client')
    assert.equal(proprio.role_name, 'proprio')
  })
})
