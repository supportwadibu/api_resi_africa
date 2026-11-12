import { test } from '@japa/runner'

import {
  buildPlatformClients,
  filterPlatformClients,
  type BookingSource,
} from '#features/clients/platform_clients'

import type { PropertySummaryDto } from '#features/properties/dto/platform_property.dto'

const owners = new Map([
  ['o1', { id: 'o1', full_name: 'Awa Koné', email: null, phone: null }],
  ['o2', { id: 'o2', full_name: 'Yao Kouassi', email: null, phone: null }],
])

function summary(id: string, title: string): PropertySummaryDto {
  return {
    id,
    title,
    unit_label: null,
    property_type: 'studio',
    status: 'published',
    daily_price: 20000,
    city: 'Abidjan',
    image: null,
    residence_id: null,
  }
}

const properties = new Map([
  ['p1', summary('p1', 'Studio Cocody')],
  ['p2', summary('p2', 'Villa Assinie')],
])

function booking(overrides: Partial<BookingSource>): BookingSource {
  return {
    property_id: 'p1',
    owner_id: 'o1',
    client_id: 'c1',
    source: 'offline',
    status: 'completed',
    start_date: new Date('2026-05-01'),
    total_amount: 40000,
    ...overrides,
  }
}

test.group('buildPlatformClients', () => {
  test('une fiche du carnet porte son propriétaire et ses logements', ({ assert }) => {
    const [client] = buildPlatformClients({
      carnet: [{ _id: 'c1', owner_id: 'o1', full_name: 'Moussa' }],
      accounts: [],
      bookings: [
        booking({}),
        booking({ start_date: new Date('2026-07-01') }),
        booking({ status: 'cancelled', start_date: new Date('2026-09-01') }),
      ],
      owners,
      properties,
    })

    assert.equal(client.owners[0].full_name, 'Awa Koné')
    // L'annulation ne compte ni comme séjour ni comme dernier séjour.
    assert.equal(client.stays, 2)
    assert.equal(client.total_paid, 80000)
    assert.deepEqual(client.last_stay_at, new Date('2026-07-01'))
    assert.lengthOf(client.properties, 1)
    assert.equal(client.properties[0].stays, 2)
  })

  test('un compte prend pour propriétaires ceux des logements réservés', ({ assert }) => {
    const [client] = buildPlatformClients({
      carnet: [],
      accounts: [{ _id: 'u1', full_name: 'Aminata', email: 'a@x.ci' }],
      bookings: [
        booking({ client_id: 'u1', source: 'online', property_id: 'p1', owner_id: 'o1' }),
        // Réservation antérieure au comptoir : sans `source`, donc en ligne.
        booking({ client_id: 'u1', source: undefined, property_id: 'p2', owner_id: 'o2' }),
      ],
      owners,
      properties,
    })

    assert.sameMembers(
      client.owners.map((o) => o.id),
      ['o1', 'o2']
    )
    assert.sameMembers(
      client.properties.map((p) => p.property.title),
      ['Studio Cocody', 'Villa Assinie']
    )
  })

  test('une fiche et un compte de même identifiant restent distincts', ({ assert }) => {
    const clients = buildPlatformClients({
      carnet: [{ _id: 'x', owner_id: 'o1', full_name: 'Fiche' }],
      accounts: [{ _id: 'x', full_name: 'Compte' }],
      bookings: [booking({ client_id: 'x', source: 'online' })],
      owners,
      properties,
    })

    const fiche = clients.find((c) => c.kind === 'carnet')!
    const account = clients.find((c) => c.kind === 'account')!
    assert.equal(fiche.stays, 0)
    assert.equal(account.stays, 1)
  })
})

test.group('filterPlatformClients', () => {
  const clients = buildPlatformClients({
    carnet: [
      { _id: 'c1', owner_id: 'o1', full_name: 'Moussa Traoré', phone: '+225 07 11 22 33' },
      { _id: 'c2', owner_id: 'o2', full_name: 'Éloïse Bamba' },
    ],
    accounts: [{ _id: 'u1', full_name: 'Aminata' }],
    bookings: [booking({ client_id: 'c1', start_date: new Date('2026-02-01') })],
    owners,
    properties,
  })

  test('cherche sans accents, par logement et par numéro', ({ assert }) => {
    assert.equal(filterPlatformClients(clients, { q: 'eloise' })[0]?.id, 'c2')
    assert.equal(filterPlatformClients(clients, { q: 'studio cocody' })[0]?.id, 'c1')
    assert.equal(filterPlatformClients(clients, { q: '0711' })[0]?.id, 'c1')
  })

  test('filtre par nature, propriétaire et logement', ({ assert }) => {
    assert.lengthOf(filterPlatformClients(clients, { kind: 'account' }), 1)
    assert.deepEqual(
      filterPlatformClients(clients, { owner_id: 'o2' }).map((c) => c.id),
      ['c2']
    )
    assert.deepEqual(
      filterPlatformClients(clients, { property_id: 'p1' }).map((c) => c.id),
      ['c1']
    )
  })

  test('met le dernier séjour en tête, puis les autres par nom', ({ assert }) => {
    assert.deepEqual(
      filterPlatformClients(clients, {}).map((c) => c.id),
      ['c1', 'u1', 'c2']
    )
  })
})
