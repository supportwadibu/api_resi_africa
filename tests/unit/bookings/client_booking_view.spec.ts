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
})
