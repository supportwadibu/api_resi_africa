import { test } from '@japa/runner'

import {
  buildMapPoints,
  mapCoordinates,
  type MapPropertySource,
  type MapResidenceSource,
} from '#features/residences/platform_map'

const ABIDJAN = { latitude: 5.3364, longitude: -3.9772 }

function residence(overrides: Partial<MapResidenceSource> = {}): MapResidenceSource {
  return {
    _id: 'res-1',
    owner_id: 'owner-1',
    name: 'Les Palmiers',
    address: { street: 'Rue 12', city: 'Abidjan', coordinates: ABIDJAN },
    media: { images: [] },
    units_count: 2,
    ...overrides,
  }
}

function property(overrides: Partial<MapPropertySource> = {}): MapPropertySource {
  return {
    _id: 'prop-1',
    owner_id: 'owner-1',
    residence_id: null,
    title: 'Studio Cocody',
    property_type: 'studio',
    status: 'published',
    address: { street: 'Rue 3', city: 'Abidjan', coordinates: ABIDJAN },
    media: { images: ['https://img/1.jpg'] },
    pricing: { daily_price: 25000 },
    ...overrides,
  }
}

const owners = new Map([
  ['owner-1', { id: 'owner-1', full_name: 'Awa', email: null, phone: '+2250700000000' }],
])

test.group('mapCoordinates', () => {
  test('écarte les coordonnées absentes, hors bornes ou nulles', ({ assert }) => {
    assert.isNull(mapCoordinates(undefined))
    assert.isNull(mapCoordinates({ coordinates: { latitude: null, longitude: -3.9 } }))
    assert.isNull(mapCoordinates({ coordinates: { latitude: 95, longitude: 0.5 } }))
    // Valeur des formulaires restés vides.
    assert.isNull(mapCoordinates({ coordinates: { latitude: 0, longitude: 0 } }))
    assert.deepEqual(mapCoordinates({ coordinates: ABIDJAN }), ABIDJAN)
  })
})

test.group('buildMapPoints', () => {
  test('une unité de résidence ne fait pas de point à part', ({ assert }) => {
    const { data } = buildMapPoints(
      [residence()],
      [
        property({ _id: 'u1', residence_id: 'res-1', pricing: { daily_price: 30000 } }),
        property({
          _id: 'u2',
          residence_id: 'res-1',
          status: 'draft',
          pricing: { daily_price: 10000 },
        }),
      ],
      owners
    )

    assert.lengthOf(data, 1)
    assert.equal(data[0].kind, 'residence')
    assert.equal(data[0].published_count, 1)
    // Le brouillon moins cher n'est pas réservable : il ne fixe pas le prix d'appel.
    assert.equal(data[0].min_daily_price, 30000)
    assert.equal(data[0].owner?.full_name, 'Awa')
  })

  test('un bien sans residence_id, antérieur aux résidences, est autonome', ({ assert }) => {
    const legacy = property()
    delete legacy.residence_id

    const { data } = buildMapPoints([], [legacy], owners)

    assert.lengthOf(data, 1)
    assert.equal(data[0].kind, 'property')
    assert.equal(data[0].property_type, 'studio')
    assert.equal(data[0].min_daily_price, 25000)
  })

  test('compte les lieux sans coordonnées au lieu de les placer', ({ assert }) => {
    const { data, without_coordinates: missing } = buildMapPoints(
      [residence({ address: { city: 'Abidjan' } })],
      [property({ address: { coordinates: { latitude: 0, longitude: 0 } } })],
      owners
    )

    assert.lengthOf(data, 0)
    assert.equal(missing, 2)
  })

  test('une résidence sans coordonnées prend celles d’une de ses unités', ({ assert }) => {
    // Cas réel : résidence saisie sans localisation, unités localisées.
    const { data, without_coordinates: missing } = buildMapPoints(
      [
        residence({
          address: { city: 'Abidjan', coordinates: { latitude: null, longitude: null } },
        }),
      ],
      [
        property({
          _id: 'u1',
          residence_id: 'res-1',
          address: { coordinates: { latitude: null, longitude: null } },
        }),
        property({ _id: 'u2', residence_id: 'res-1' }),
      ],
      owners
    )

    assert.lengthOf(data, 1)
    assert.equal(data[0].kind, 'residence')
    assert.equal(data[0].latitude, ABIDJAN.latitude)
    assert.equal(missing, 0)
  })

  test('une résidence sans photo prend celle d’une de ses unités', ({ assert }) => {
    const { data } = buildMapPoints(
      [residence()],
      [property({ residence_id: 'res-1', media: { images: ['https://img/unit.jpg'] } })],
      owners
    )

    assert.equal(data[0].image, 'https://img/unit.jpg')
  })

  test('un propriétaire introuvable laisse le point sans propriétaire', ({ assert }) => {
    const { data } = buildMapPoints([residence({ owner_id: 'inconnu' })], [], owners)

    assert.isNull(data[0].owner)
    assert.isNull(data[0].min_daily_price)
  })
})
