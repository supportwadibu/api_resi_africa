import { test } from '@japa/runner'
import {
  buildStayBuckets,
  stayBucketOf,
  type StayBreakdownBooking,
} from '#features/platform_stats/stay_type_breakdown'

function booking(overrides: Partial<StayBreakdownBooking> = {}): StayBreakdownBooking {
  return { stay_type: 'full_day', days_count: 1, total_amount: 20000, ...overrides }
}

test.group('stayBucketOf', () => {
  test('range passage et demi-journée selon leur type, quelle que soit la durée', ({ assert }) => {
    assert.equal(stayBucketOf(booking({ stay_type: 'passage', days_count: 3 })), 'passage')
    assert.equal(stayBucketOf(booking({ stay_type: 'half_day' })), 'half_day')
  })

  test('découpe les séjours complets aux seuils 2, 7 et 30 jours', ({ assert }) => {
    assert.equal(stayBucketOf(booking({ days_count: 1 })), 'one_day')
    assert.equal(stayBucketOf(booking({ days_count: 2 })), 'two_to_six_days')
    assert.equal(stayBucketOf(booking({ days_count: 6 })), 'two_to_six_days')
    assert.equal(stayBucketOf(booking({ days_count: 7 })), 'seven_to_twenty_nine_days')
    assert.equal(stayBucketOf(booking({ days_count: 29 })), 'seven_to_twenty_nine_days')
    assert.equal(stayBucketOf(booking({ days_count: 30 })), 'thirty_days_plus')
  })

  test('traite un type inconnu ou une durée nulle comme une nuitée', ({ assert }) => {
    // Réservations antérieures au comptoir : ni type ni durée fiables.
    assert.equal(stayBucketOf(booking({ stay_type: 'legacy', days_count: 0 })), 'one_day')
  })
})

test.group('buildStayBuckets', () => {
  test('rend les six tranches dans l’ordre, même vides', ({ assert }) => {
    const buckets = buildStayBuckets([])
    assert.deepEqual(
      buckets.map((b) => b.key),
      [
        'passage',
        'half_day',
        'one_day',
        'two_to_six_days',
        'seven_to_twenty_nine_days',
        'thirty_days_plus',
      ]
    )
    assert.isTrue(buckets.every((b) => b.bookings === 0 && b.share_percent === 0))
  })

  test('compte, somme le chiffre d’affaires et pondère l’occupation', ({ assert }) => {
    const buckets = buildStayBuckets([
      booking({ stay_type: 'passage', total_amount: 6000 }),
      booking({ stay_type: 'half_day', total_amount: 10000 }),
      booking({ days_count: 10, total_amount: 180000 }),
      booking({ days_count: 12, total_amount: 200000 }),
    ])
    const byKey = Object.fromEntries(buckets.map((b) => [b.key, b]))

    assert.equal(byKey.seven_to_twenty_nine_days.bookings, 2)
    assert.equal(byKey.seven_to_twenty_nine_days.revenue, 380000)
    assert.equal(byKey.seven_to_twenty_nine_days.share_percent, 50)
    assert.equal(byKey.seven_to_twenty_nine_days.occupancy_days, 22)
    assert.equal(byKey.passage.occupancy_days, 0.25)
    assert.equal(byKey.half_day.occupancy_days, 0.5)
  })
})
