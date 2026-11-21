import { test } from '@japa/runner'

import { BookingNotifier, buildBookingMessage } from '#features/bookings/booking_notifier'

test.group('BookingNotifier', () => {
  test('réservation en ligne : logement et période dans le texte', ({ assert }) => {
    const message = buildBookingMessage(
      {
        id: 'b1',
        owner_id: 'o1',
        start_date: new Date('2026-11-21T12:00:00Z'),
        end_date: new Date('2026-11-23T12:00:00Z'),
        property: { title: 'Studio Cocody' },
      },
      'online'
    )

    assert.equal(message.title, 'Nouvelle réservation')
    assert.equal(
      message.body,
      'Réservation payée en ligne pour Studio Cocody du 21 novembre au 23 novembre.'
    )
    assert.deepEqual(message.data, { type: 'booking_created', booking_id: 'b1' })
  })

  test('saisie d’un gérant : dates du comptoir, logement absent toléré', ({ assert }) => {
    const message = buildBookingMessage(
      { id: 'b2', owner_id: 'o1', check_in_at: new Date('2026-11-21T10:00:00Z') },
      'manager'
    )
    assert.equal(message.body, 'Un gérant a enregistré une réservation à partir du 21 novembre.')
  })

  test('envoyé au propriétaire du logement', async ({ assert }) => {
    const sent: string[] = []
    const notifier = new BookingNotifier({
      execute: async (userId: string) => {
        sent.push(userId)
        return true
      },
    })
    await notifier.onlineBookingPaid({ id: 'b1', owner_id: 'o1' })
    assert.deepEqual(sent, ['o1'])
  })
})
