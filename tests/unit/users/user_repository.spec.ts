import { test } from '@japa/runner'

import { matchesUserSearch, UserRepository } from '#features/users/repositories/user_repository'

import type { UserRecord } from '#models/user'

function record(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    _id: 'user-1',
    role_id: 'client',
    full_name: 'Awa Koné',
    email: 'awa@example.com',
    phone: '+2250712345678',
    avatar_url: null,
    auth_channel: 'email',
    password: '$2a$12$empreinte-bcrypt-fictive',
    auth_providers: [],
    auth_provider_keys: [],
    is_verified: true,
    is_active: true,
    last_login_at: null,
    profile: {
      company_name: null,
      siret: null,
      cin: null,
      date_of_birth: null,
      address: null,
      city: null,
      country: null,
      id_document_type: null,
      id_document_number: null,
      id_document_front_public_id: null,
      id_document_back_public_id: null,
      submitted_at: null,
    },
    owner_status: 'pending',
    validated_by: null,
    validated_at: null,
    rejection_reason: null,
    metadata: {
      created_by: null,
      created_at: new Date('2026-01-01'),
      updated_at: new Date('2026-01-02'),
    },
    ...overrides,
  }
}

test.group('UserRepository.toDto', () => {
  test('ne porte jamais le mot de passe ni les identités externes', ({ assert }) => {
    const dto = UserRepository.toDto(record())
    const serialized = JSON.stringify(dto)

    assert.notInclude(serialized, '$2a$12$')
    assert.notProperty(dto, 'password')
    assert.notProperty(dto, 'auth_providers')
    assert.notProperty(dto, 'auth_provider_keys')
  })

  test('n’expose un statut de validation que pour un propriétaire', ({ assert }) => {
    // Le champ vaut `pending` par défaut sur tous les comptes : exposé sur un
    // client, il le ferait passer pour un compte en attente de validation.
    assert.isNull(UserRepository.toDto(record({ role_id: 'client' })).owner_status)
    assert.equal(
      UserRepository.toDto(record({ role_id: 'proprio', owner_status: 'active' })).owner_status,
      'active'
    )
  })

  test('lit un compte historique sans `is_active` comme actif', ({ assert }) => {
    const legacy = record()
    delete (legacy as Partial<UserRecord>).is_active

    assert.isTrue(UserRepository.toDto(legacy).is_active)
  })
})

test.group('matchesUserSearch', () => {
  test('cherche dans le nom sans tenir compte de la casse', ({ assert }) => {
    assert.isTrue(matchesUserSearch(record(), 'koné'))
    assert.isTrue(matchesUserSearch(record(), 'AWA'))
  })

  test('cherche dans l’e-mail', ({ assert }) => {
    assert.isTrue(matchesUserSearch(record(), 'example.com'))
  })

  test('cherche un téléphone saisi avec des espaces', ({ assert }) => {
    assert.isTrue(matchesUserSearch(record(), '07 12 34'))
  })

  test('écarte un compte sans correspondance', ({ assert }) => {
    assert.isFalse(matchesUserSearch(record(), 'Yao'))
  })

  test('supporte un compte sans e-mail ni téléphone', ({ assert }) => {
    assert.isFalse(matchesUserSearch(record({ email: null, phone: null }), 'zzz'))
  })
})
