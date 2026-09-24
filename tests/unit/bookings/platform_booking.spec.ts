import { test } from '@japa/runner'

import {
  attachBookingRelations,
  clientIdsToLoad,
  clientKind,
  resolveBookingClient,
} from '#features/bookings/platform_booking'
import { aggregatePropertyClients } from '#features/clients/property_clients'

import type { BookingDto } from '#features/bookings/dto/booking.dto'

function booking(id: string, overrides: Partial<BookingDto> = {}): BookingDto {
  return {
    id,
    property_id: 'p1',
    residence_id: null,
    owner_id: 'owner-1',
    client_id: 'c1',
    status: 'completed',
    start_date: new Date('2026-08-01T12:00:00Z'),
    end_date: new Date('2026-08-03T12:00:00Z'),
    days_count: 2,
    daily_price: 20000,
    duration_discount_percent: 0,
    subtotal_amount: 40000,
    discount_amount: 0,
    total_amount: 40000,
    promo_code: null,
    message: null,
    cancelled_at: null,
    completed_at: null,
    cancellation_reason: null,
    created_at: new Date('2026-07-20'),
    updated_at: new Date('2026-07-20'),
    refunded_amount: 0,
    source: 'online',
    ...overrides,
  }
}

const noRelations = { users: new Map(), carnet: new Map() }

test.group('clientKind', () => {
  test('une réservation sans `source` est en ligne', ({ assert }) => {
    // L'historique antérieur au comptoir ne porte pas le champ.
    assert.equal(clientKind({ source: undefined }), 'account')
    assert.equal(clientKind({ source: 'offline' }), 'carnet')
  })
})

test.group('clientIdsToLoad', () => {
  test('ne lit rien pour une réservation portant son instantané', ({ assert }) => {
    const ids = clientIdsToLoad([
      booking('b1', {
        source: 'offline',
        client: { id: 'c1', full_name: 'Awa', phone: '0700000000' },
      }),
      booking('b2', { client_id: 'u1' }),
      booking('b3', { source: 'offline', client_id: 'c3' }),
    ])

    assert.deepEqual(ids, { accounts: ['u1'], carnet: ['c3'] })
  })
})

test.group('resolveBookingClient', () => {
  test('l’instantané prime sur la fiche actuelle', ({ assert }) => {
    // Une fiche renommée ne réécrit pas l'historique : la réservation montre
    // le nom sous lequel le séjour a été pris.
    const client = resolveBookingClient(
      booking('b1', {
        source: 'offline',
        client: { id: 'c1', full_name: 'Awa Koné', phone: '0700000000' },
      }),
      {
        users: new Map(),
        carnet: new Map([['c1', { id: 'c1', full_name: 'Awa Traoré', phone: '0700000000' }]]),
      }
    )

    assert.equal(client?.full_name, 'Awa Koné')
    assert.equal(client?.kind, 'carnet')
  })

  test('nomme une réservation en ligne par le compte du client', ({ assert }) => {
    const client = resolveBookingClient(booking('b1', { client_id: 'u1' }), {
      users: new Map([
        ['u1', { id: 'u1', full_name: 'Yao', email: 'yao@example.com', phone: null }],
      ]),
      carnet: new Map(),
    })

    assert.deepEqual(client, {
      id: 'u1',
      kind: 'account',
      full_name: 'Yao',
      phone: null,
      email: 'yao@example.com',
    })
  })

  test('ne confond pas un compte et une fiche de même identifiant', ({ assert }) => {
    // `users` et `clients` sont deux collections : rien n'y interdit deux
    // documents de même identifiant.
    const client = resolveBookingClient(booking('b1', { client_id: 'x' }), {
      users: new Map(),
      carnet: new Map([['x', { id: 'x', full_name: 'Fiche', phone: '0700000000' }]]),
    })

    assert.isNull(client)
  })
})

test.group('attachBookingRelations', () => {
  test('garde une réservation dont le logement a disparu', ({ assert }) => {
    const [row] = attachBookingRelations([booking('b1')], {
      properties: new Map(),
      residences: new Map(),
      ...noRelations,
    })

    assert.equal(row.id, 'b1')
    assert.isNull(row.property)
    assert.isNull(row.residence)
    assert.isNull(row.owner)
  })
})

test.group('aggregatePropertyClients', () => {
  test('regroupe les réservations par client', ({ assert }) => {
    const clients = aggregatePropertyClients(
      [
        booking('b3', { client_id: 'u1', start_date: new Date('2026-09-01') }),
        booking('b2', { client_id: 'u2' }),
        booking('b1', { client_id: 'u1', start_date: new Date('2026-06-01') }),
      ],
      noRelations
    )

    assert.lengthOf(clients, 2)
    const u1 = clients.find((c) => c.client_id === 'u1')!
    assert.equal(u1.bookings_count, 2)
    assert.equal(u1.stats.total_stays, 2)
    assert.equal(u1.last_booking.id, 'b3')
  })

  test('compte une annulation sans en faire un séjour', ({ assert }) => {
    const [client] = aggregatePropertyClients(
      [booking('b2', { status: 'cancelled' }), booking('b1')],
      noRelations
    )

    assert.equal(client.bookings_count, 2)
    assert.equal(client.stats.total_stays, 1)
    assert.equal(client.stats.total_paid, 40000)
  })

  test('sépare un compte et une fiche du carnet de même identifiant', ({ assert }) => {
    const clients = aggregatePropertyClients(
      [booking('b2', { client_id: 'x', source: 'offline' }), booking('b1', { client_id: 'x' })],
      noRelations
    )

    assert.lengthOf(clients, 2)
  })

  test('nomme le client par l’instantané le plus récent', ({ assert }) => {
    const [client] = aggregatePropertyClients(
      [
        booking('b2', {
          source: 'offline',
          client: { id: 'c1', full_name: 'Awa Koné', phone: '0700000000' },
        }),
        booking('b1', {
          source: 'offline',
          client: { id: 'c1', full_name: 'Awa K.', phone: '0700000000' },
        }),
      ],
      noRelations
    )

    assert.equal(client.full_name, 'Awa Koné')
  })

  test('place en tête le dernier séjour', ({ assert }) => {
    const clients = aggregatePropertyClients(
      [
        booking('b1', { client_id: 'ancien', start_date: new Date('2026-01-01') }),
        booking('b2', { client_id: 'recent', start_date: new Date('2026-09-01') }),
        booking('b3', { client_id: 'annule', status: 'cancelled' }),
      ],
      noRelations
    )

    assert.deepEqual(
      clients.map((c) => c.client_id),
      ['recent', 'ancien', 'annule']
    )
  })
})
