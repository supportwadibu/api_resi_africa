import { test } from '@japa/runner'

import { attachClientView } from '#features/bookings/client_booking_view'

const booking = { id: 'b1', property_id: 'p1' } as never

test.group('attachClientView', () => {
  test('joint le résumé du bien et le dernier état de paiement', ({ assert }) => {
    const [view] = attachClientView(
      [booking],
      new Map([
        [
          'p1',
          {
            id: 'p1',
            title: 'Villa Cocody',
            address: { city: 'Abidjan' },
            media: { images: ['a.jpg'] },
          },
        ],
      ]),
      [
        { booking_id: 'b1', status: 'expired', created_at: new Date('2026-10-01') },
        { booking_id: 'b1', status: 'success', created_at: new Date('2026-10-02') },
      ]
    )

    assert.deepEqual(view.property, {
      id: 'p1',
      title: 'Villa Cocody',
      city: 'Abidjan',
      image: 'a.jpg',
    })
    assert.equal(view.payment_status, 'success')
  })

  test('sans paiement ni bien : champs nuls, réservation conservée', ({ assert }) => {
    const [view] = attachClientView([booking], new Map(), [])
    assert.isUndefined(view.property)
    assert.isNull(view.payment_status)
  })

  test('bien historique sans adresse ni médias : résumé quand même', ({ assert }) => {
    const [view] = attachClientView(
      [booking],
      new Map([['p1', { id: 'p1', title: 'Studio' } as never]]),
      []
    )
    assert.deepEqual(view.property, { id: 'p1', title: 'Studio', city: '', image: null })
  })

  test('séjour payé : le contact du propriétaire et l’adresse complète', ({ assert }) => {
    const [view] = attachClientView(
      [{ id: 'b1', property_id: 'p1', owner_id: 'o1', status: 'confirmed' } as never],
      new Map([
        ['p1', { id: 'p1', title: 'Villa', address: { street: 'Rue 12', city: 'Abidjan' } }],
      ]),
      [{ booking_id: 'b1', status: 'success', created_at: new Date() }],
      new Map([
        ['o1', { full_name: 'Jean Kouassi', phone: '0700000000', address: 'Cocody', city: null }],
      ])
    )
    assert.deepEqual(view.owner_contact, {
      full_name: 'Jean Kouassi',
      phone: '0700000000',
      address: 'Cocody',
      property_address: 'Rue 12, Abidjan',
    })
  })

  test('non payée ou annulée : le propriétaire reste caché', ({ assert }) => {
    const owners = new Map([['o1', { full_name: 'Jean', phone: '07', address: null, city: null }]])
    const [unpaid] = attachClientView(
      [{ id: 'b1', property_id: 'p1', owner_id: 'o1', status: 'confirmed' } as never],
      new Map(),
      [{ booking_id: 'b1', status: 'pending', created_at: new Date() }],
      owners
    )
    const [cancelled] = attachClientView(
      [{ id: 'b1', property_id: 'p1', owner_id: 'o1', status: 'cancelled' } as never],
      new Map(),
      [{ booking_id: 'b1', status: 'success', created_at: new Date() }],
      owners
    )
    assert.isNull(unpaid.owner_contact)
    assert.isNull(cancelled.owner_contact)
  })
})
