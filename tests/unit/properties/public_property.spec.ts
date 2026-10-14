import { test } from '@japa/runner'

import { isPublicProperty, toPublicProperty } from '#features/properties/public_property'

const property = {
  id: 'p1',
  owner_id: 'owner-1',
  title: 'Villa',
  address: {
    street: '12 rue des Jardins',
    city: 'Abidjan',
    country: "Côte d'Ivoire",
    postal_code: '01',
    coordinates: { latitude: 5.359876, longitude: -3.987654 },
  },
  rental_info: { current_tenant_id: 'tenant-9', last_rent_payment_date: null },
  metadata: { views_count: 12, contact_requests_count: 3, last_viewed_at: null },
} as never

test.group('toPublicProperty', () => {
  test('retire ce qui permettrait de contourner la plateforme', ({ assert }) => {
    const pub = toPublicProperty(property) as Record<string, unknown>

    assert.notProperty(pub, 'owner_id')
    assert.notProperty(pub, 'rental_info')
    assert.notProperty(pub, 'metadata')
    assert.equal(pub.title, 'Villa')
  })

  test('adresse réduite à la ville, position arrondie à environ 100 m', ({ assert }) => {
    const pub = toPublicProperty(property)

    assert.deepEqual(pub.address, {
      street: '',
      city: 'Abidjan',
      country: "Côte d'Ivoire",
      postal_code: null,
      coordinates: { latitude: 5.36, longitude: -3.988 },
    })
  })

  test('bien sans coordonnées : rien n’est inventé', ({ assert }) => {
    const pub = toPublicProperty({ id: 'p2', address: { city: 'Bouaké' } } as never)
    assert.deepEqual(pub.address.coordinates, { latitude: null, longitude: null })
  })

  test('publique seulement si publiée et déclarée publique', ({ assert }) => {
    assert.isTrue(isPublicProperty({ status: 'published', visibility: { is_public: true } }))
    assert.isFalse(isPublicProperty({ status: 'draft', visibility: { is_public: true } }))
    // Bien historique sans visibilité : privé, comme la liste publique le
    // traite déjà (filtre `is_public == true`).
    assert.isFalse(isPublicProperty({ status: 'published' }))
  })
})
