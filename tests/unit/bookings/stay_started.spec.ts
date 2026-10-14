import { test } from '@japa/runner'
import { isStayStarted } from '#features/bookings/use_cases/check_out_booking.use_case'

test.group('isStayStarted', () => {
  const maintenant = new Date('2026-11-10T09:00:00Z')

  test('refuse un séjour dont l’entrée est à venir', ({ assert }) => {
    const booking = {
      start_date: new Date('2026-11-12T12:00:00Z'),
      check_in_at: new Date('2026-11-12T12:00:00Z'),
    }

    assert.isFalse(isStayStarted(booking, maintenant))
  })

  test('accepte un séjour en cours', ({ assert }) => {
    const booking = {
      start_date: new Date('2026-11-08T12:00:00Z'),
      check_in_at: new Date('2026-11-08T12:00:00Z'),
    }

    assert.isTrue(isStayStarted(booking, maintenant))
  })

  test('accepte un séjour dont l’entrée tombe à l’instant même', ({ assert }) => {
    assert.isTrue(isStayStarted({ start_date: maintenant, check_in_at: maintenant }, maintenant))
  })

  test('lit l’heure d’entrée plutôt que le jour quand elle existe', ({ assert }) => {
    // Un passage saisi pour 14 h le jour même : `start_date` est déjà
    // dépassée, mais le client n'est pas encore entré.
    const booking = {
      start_date: new Date('2026-11-10T00:00:00Z'),
      check_in_at: new Date('2026-11-10T14:00:00Z'),
    }

    assert.isFalse(isStayStarted(booking, maintenant))
  })

  test('se replie sur start_date pour l’historique sans check_in_at', ({ assert }) => {
    assert.isTrue(isStayStarted({ start_date: new Date('2026-11-01T12:00:00Z') }, maintenant))
    assert.isFalse(isStayStarted({ start_date: new Date('2026-11-20T12:00:00Z') }, maintenant))
  })
})
