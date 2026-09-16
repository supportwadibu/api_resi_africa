import { test } from '@japa/runner'

import { assertPropertiesOwned } from '#features/managers/use_cases/create_manager.use_case'
import { DomainError } from '#utils/domain_error'

const OWNED = [
  { _id: 'studio-1', owner_id: 'owner-1' },
  { _id: 'studio-2', owner_id: 'owner-1' },
]

test.group('assertPropertiesOwned', () => {
  test('laisse passer des logements du propriétaire', ({ assert }) => {
    assert.doesNotThrows(() => assertPropertiesOwned(OWNED, ['studio-1'], 'owner-1'))
  })

  test('refuse un logement appartenant à un autre propriétaire', ({ assert }) => {
    try {
      assertPropertiesOwned(OWNED, ['studio-1', 'studio-9'], 'owner-1')
      assert.fail('aurait dû lever')
    } catch (error) {
      assert.instanceOf(error, DomainError)
      assert.equal((error as DomainError).code, 'property_not_owned')
      assert.equal((error as DomainError).status, 422)
    }
  })

  test('accepte une affectation vide', ({ assert }) => {
    // Un gérant créé sans logement est légitime : le propriétaire lui en
    // attribuera ensuite. Il ne voit alors rien, ce que garantit `filterByScope`.
    assert.doesNotThrows(() => assertPropertiesOwned(OWNED, [], 'owner-1'))
  })

  test('refuse un logement présent dans la liste mais détenu par un tiers', ({ assert }) => {
    // Le contrôle ne se contente pas de l'existence : un logement lu depuis la
    // base mais rattaché à un autre `owner_id` reste hors de portée.
    const mixed = [...OWNED, { _id: 'studio-3', owner_id: 'owner-2' }]

    assert.throws(() => assertPropertiesOwned(mixed, ['studio-3'], 'owner-1'))
  })
})

test.group('toManagerDto', () => {
  test('ne porte jamais le mot de passe ni son empreinte', async ({ assert }) => {
    const { toManagerDto } = await import('#features/managers/dto/manager.dto')

    // Le compte est passé avec son empreinte bcrypt — comme le document
    // Firestore le porte réellement — pour vérifier que le DTO ne la reprend
    // pas. `ManagerAccountView` l'exclut déjà au niveau du type ; ce test
    // verrouille le comportement à l'exécution.
    const account = {
      _id: 'manager-1',
      full_name: 'Awa Koné',
      email: 'awa@example.com',
      phone: '+2250700000000',
      password: '$2a$12$empreinte-bcrypt-fictive',
      is_active: true,
      metadata: { created_by: 'owner-1', created_at: new Date('2026-01-01'), updated_at: null },
    }

    const dto = toManagerDto(account, { property_ids: ['studio-1'], is_active: true })

    const serialized = JSON.stringify(dto)
    assert.notInclude(serialized, 'password')
    assert.notInclude(serialized, '$2a$12$')
    assert.notProperty(dto, 'password')
    assert.deepEqual(dto.property_ids, ['studio-1'])
  })

  test('replie un gérant sans affectation sur un périmètre vide et inactif', async ({ assert }) => {
    // Un compte gérant dont l'affectation aurait été supprimée ne doit pas
    // paraître actif : sans affectation, `scope()` lui refuse déjà tout accès.
    const { toManagerDto } = await import('#features/managers/dto/manager.dto')

    const account = {
      _id: 'manager-2',
      full_name: 'Yao N’Guessan',
      email: null,
      phone: '+2250500000000',
      password: null,
      is_active: true,
      metadata: { created_by: 'owner-1', created_at: new Date('2026-01-01'), updated_at: null },
    }

    const dto = toManagerDto(account, null)

    assert.deepEqual(dto.property_ids, [])
    assert.isFalse(dto.is_active)
  })
})
