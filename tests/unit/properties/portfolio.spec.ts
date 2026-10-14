import { test } from '@japa/runner'

import {
  attachPropertyRelations,
  buildOwnerPortfolio,
  groupUnitsByResidence,
} from '#features/properties/portfolio'

import type { PropertyDto } from '#features/properties/dto/property.dto'
import type { ResidenceDto } from '#features/residences/dto/residence.dto'

function residence(id: string, overrides: Partial<ResidenceDto> = {}): ResidenceDto {
  return {
    id,
    owner_id: 'owner-1',
    name: `Résidence ${id}`,
    description: '',
    address: {
      street: '',
      city: 'Abidjan',
      country: 'CI',
      postal_code: null,
      coordinates: { latitude: null, longitude: null },
    },
    media: { images: [], videos: [] },
    amenities: {
      pool: false,
      gym: false,
      security: false,
      concierge: false,
      elevator: false,
      parking: false,
      garden: false,
      wifi: false,
    },
    units_count: 0,
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    ...overrides,
  }
}

function property(id: string, overrides: Partial<PropertyDto> = {}): PropertyDto {
  return {
    id,
    owner_id: 'owner-1',
    residence_id: null,
    unit_label: null,
    title: `Logement ${id}`,
    description: '',
    property_type: 'studio',
    status: 'published',
    address: { street: '', city: 'Abidjan' },
    details: { bedrooms: 1, bathrooms: 1, living_rooms: 0, kitchens: 1, parking_spaces: 0 },
    amenities: {},
    media: { images: [] },
    pricing: { daily_price: 25000 },
    charges_included: false,
    additional_charges: 0,
    available_from: new Date('2026-01-01'),
    visibility: { is_public: true, featured: false, published_at: null },
    rental_info: { current_tenant_id: null, last_rent_payment_date: null },
    metadata: { views_count: 0, contact_requests_count: 0, last_viewed_at: null },
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    ...overrides,
  }
}

test.group('groupUnitsByResidence', () => {
  test('range chaque unité sous sa résidence et laisse les autonomes à part', ({ assert }) => {
    const grouped = groupUnitsByResidence(
      [residence('r1')],
      [property('p1', { residence_id: 'r1' }), property('p2')]
    )

    assert.deepEqual(
      grouped.residences[0].units.map((u) => u.id),
      ['p1']
    )
    assert.deepEqual(
      grouped.standalone.map((u) => u.id),
      ['p2']
    )
  })

  test('rend une résidence sans unité plutôt que de la masquer', ({ assert }) => {
    // Contrairement au regroupement du gérant, le back-office voit tout : une
    // résidence créée mais pas encore garnie existe bel et bien.
    const grouped = groupUnitsByResidence([residence('r1')], [])

    assert.lengthOf(grouped.residences, 1)
    assert.deepEqual(grouped.residences[0].units, [])
    assert.equal(grouped.residences[0].units_count, 0)
  })

  test('garde visible un logement rattaché à une résidence disparue', ({ assert }) => {
    const grouped = groupUnitsByResidence([], [property('p1', { residence_id: 'supprimee' })])

    assert.deepEqual(
      grouped.standalone.map((u) => u.id),
      ['p1']
    )
    // Le rattachement orphelin reste lisible : c'est lui qui le signale.
    assert.equal(grouped.standalone[0].residence_id, 'supprimee')
  })

  test('recompte les unités au lieu de reprendre le compteur dénormalisé', ({ assert }) => {
    const grouped = groupUnitsByResidence(
      [residence('r1', { units_count: 7 })],
      [property('p1', { residence_id: 'r1' }), property('p2', { residence_id: 'r1' })]
    )

    assert.equal(grouped.residences[0].units_count, 2)
  })

  test('ordonne les unités dans l’ordre naturel de leur nom', ({ assert }) => {
    // Un tri lexicographique placerait « Studio 10 » avant « Studio 2 ».
    const grouped = groupUnitsByResidence(
      [residence('r1')],
      [
        property('p10', { residence_id: 'r1', unit_label: 'Studio 10' }),
        property('p2', { residence_id: 'r1', unit_label: 'Studio 2' }),
        property('p1', { residence_id: 'r1', unit_label: 'Studio 1' }),
      ]
    )

    assert.deepEqual(
      grouped.residences[0].units.map((u) => u.unit_label),
      ['Studio 1', 'Studio 2', 'Studio 10']
    )
  })
})

test.group('buildOwnerPortfolio', () => {
  test('totalise résidences, logements et autonomes', ({ assert }) => {
    const portfolio = buildOwnerPortfolio(
      [residence('r1'), residence('r2')],
      [property('p1', { residence_id: 'r1' }), property('p2'), property('p3')]
    )

    assert.deepEqual(portfolio.totals, { residences: 2, properties: 3, standalone: 2 })
  })
})

test.group('attachPropertyRelations', () => {
  test('joint propriétaire et résidence', ({ assert }) => {
    const [row] = attachPropertyRelations(
      [property('p1', { residence_id: 'r1' })],
      new Map([['owner-1', { id: 'owner-1', full_name: 'Awa', email: null, phone: null }]]),
      new Map([['r1', residence('r1')]])
    )

    assert.equal(row.owner?.full_name, 'Awa')
    assert.deepEqual(row.residence, { id: 'r1', name: 'Résidence r1', city: 'Abidjan' })
  })

  test('garde la ligne quand une relation est introuvable', ({ assert }) => {
    const rows = attachPropertyRelations(
      [property('p1', { residence_id: 'supprimee' })],
      new Map(),
      new Map()
    )

    assert.lengthOf(rows, 1)
    assert.isNull(rows[0].owner)
    assert.isNull(rows[0].residence)
    assert.equal(rows[0].residence_id, 'supprimee')
  })
})
