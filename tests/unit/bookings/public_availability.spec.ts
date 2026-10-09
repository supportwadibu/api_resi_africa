import { test } from '@japa/runner'

import { GetPublicAvailabilityUseCase } from '#features/bookings/use_cases/get_public_availability.use_case'

const d = (iso: string) => new Date(iso)

function useCase(
  property: Record<string, unknown> | null,
  bookings: Array<Record<string, unknown>>
) {
  return new GetPublicAvailabilityUseCase({
    findProperty: async () => property as never,
    findActiveBookings: async () => bookings as never,
  })
}

const published = { status: 'published', visibility: { is_public: true } }

test.group('GetPublicAvailabilityUseCase', () => {
  test('rend les périodes actives, sans identité', async ({ assert }) => {
    const periods = await useCase(published, [
      {
        _id: 'b1',
        status: 'confirmed',
        start_date: d('2026-10-10T12:00:00Z'),
        end_date: d('2026-10-12T12:00:00Z'),
        client_snapshot: { full_name: 'Awa Koné' },
      },
    ]).execute('p1', d('2026-10-01T00:00:00Z'))

    assert.deepEqual(periods, [
      { start: d('2026-10-10T12:00:00Z'), end: d('2026-10-12T12:00:00Z') },
    ])
  })

  test('ignore une réservation annulée', async ({ assert }) => {
    const periods = await useCase(published, [
      {
        status: 'cancelled',
        start_date: d('2026-10-10T12:00:00Z'),
        end_date: d('2026-10-12T12:00:00Z'),
      },
    ]).execute('p1')

    assert.deepEqual(periods, [])
  })

  test('préfère les heures d’arrivée et de sortie quand elles existent', async ({ assert }) => {
    const periods = await useCase(published, [
      {
        status: 'in_progress',
        start_date: d('2026-10-10T00:00:00Z'),
        end_date: d('2026-10-12T00:00:00Z'),
        check_in_at: d('2026-10-10T12:00:00Z'),
        check_out_at: d('2026-10-12T12:00:00Z'),
      },
    ]).execute('p1')

    assert.deepEqual(periods, [
      { start: d('2026-10-10T12:00:00Z'), end: d('2026-10-12T12:00:00Z') },
    ])
  })

  test('404 pour une résidence non publiée', async ({ assert }) => {
    await assert.rejects(
      () => useCase({ status: 'draft', visibility: { is_public: true } }, []).execute('p1'),
      'Résidence introuvable.'
    )
  })

  test('404 pour une résidence inconnue', async ({ assert }) => {
    await assert.rejects(() => useCase(null, []).execute('p1'), 'Résidence introuvable.')
  })
})
