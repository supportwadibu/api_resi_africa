import { test } from '@japa/runner'

import {
  buildReferrerFields,
  computeReferrerCommission,
  REFERRER_COMMISSION_RATE,
  withReferrerCommission,
} from '#features/bookings/referrer'
import { buildOwnerBookingPayload } from '#models/booking'

test.group('computeReferrerCommission', () => {
  test('10 % du séjour, arrondi au franc', ({ assert }) => {
    assert.equal(REFERRER_COMMISSION_RATE, 0.1)
    assert.equal(computeReferrerCommission(45000, 0.1), 4500)
    assert.equal(computeReferrerCommission(12345, 0.1), 1235)
  })

  test('un montant nul ou invalide ne rapporte rien', ({ assert }) => {
    assert.equal(computeReferrerCommission(0, 0.1), 0)
    assert.equal(computeReferrerCommission(Number.NaN, 0.1), 0)
  })
})

test.group('buildReferrerFields', () => {
  test('sans apporteur, aucun champ', ({ assert }) => {
    assert.deepEqual(buildReferrerFields(null, 50000), {})
    assert.deepEqual(buildReferrerFields({ name: '   ' }, 50000), {})
  })

  test('fige le taux et calcule la commission, téléphone normalisé', ({ assert }) => {
    assert.deepEqual(buildReferrerFields({ name: ' Koffi ', phone: '07 12 34 56 78' }, 50000), {
      referrer: { name: 'Koffi', phone: '0712345678' },
      referrer_commission_rate: 0.1,
      referrer_commission_amount: 5000,
    })
  })
})

test.group('withReferrerCommission', () => {
  const booking = { referrer: { name: 'Koffi', phone: null }, referrer_commission_rate: 0.1 }

  test('une prolongation relève la commission au taux figé', ({ assert }) => {
    const patch = withReferrerCommission(booking, { total_amount: 80000, days_count: 4 })

    assert.equal(patch.referrer_commission_amount, 8000)
    assert.equal(patch.days_count, 4)
  })

  test('le taux figé fait foi, pas le taux courant', ({ assert }) => {
    const patch = withReferrerCommission(
      { ...booking, referrer_commission_rate: 0.05 },
      { total_amount: 80000 }
    )

    assert.equal(patch.referrer_commission_amount, 4000)
  })

  test('sans apporteur ou sans changement de montant, le patch est inchangé', ({ assert }) => {
    const patch = { total_amount: 80000 }
    assert.strictEqual(withReferrerCommission({}, patch), patch)

    const noAmount = { status: 'completed' }
    assert.strictEqual(withReferrerCommission(booking, noAmount), noAmount)
  })
})

test.group('buildOwnerBookingPayload — apporteur', () => {
  const input = {
    owner_id: 'owner-1',
    property_id: 'p1',
    client_id: 'c1',
    client_snapshot: { full_name: 'Awa', phone: '0700000000' },
    status: 'confirmed' as const,
    stay_type: 'full_day' as const,
    check_in_at: new Date('2026-09-26T12:00:00Z'),
    check_out_at: new Date('2026-09-29T12:00:00Z'),
    days_count: 3,
    daily_price: 20000,
    expected_amount: 60000,
    received_amount: 54000,
    deposit_amount: 0,
    message: null,
    client_request_id: null,
  }

  test('la commission porte sur le montant convenu, pas sur la grille', ({ assert }) => {
    const doc = buildOwnerBookingPayload(
      { ...input, referrer: { name: 'Koffi' } },
      new Date('2026-09-26T10:00:00Z')
    )

    assert.deepEqual(doc.referrer, { name: 'Koffi', phone: null })
    assert.equal(doc.referrer_commission_rate, 0.1)
    assert.equal(doc.referrer_commission_amount, 5400)
  })

  test('sans apporteur, le document ne porte aucun champ de commission', ({ assert }) => {
    const doc = buildOwnerBookingPayload(input, new Date('2026-09-26T10:00:00Z'))

    assert.notProperty(doc, 'referrer')
    assert.notProperty(doc, 'referrer_commission_amount')
  })
})
