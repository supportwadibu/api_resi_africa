import { test } from '@japa/runner'

import {
  ARRIVAL_QR_PREFIX,
  generateArrivalCode,
  parseArrivalCode,
} from '#features/bookings/arrival_code'
import { attachArrival, readBookingArrival } from '#features/bookings/booking_arrival'
import { assertArrivalPaid } from '#features/bookings/use_cases/check_in_booking.use_case'
import { FindArrivalBookingUseCase } from '#features/bookings/use_cases/find_arrival_booking.use_case'
import {
  assertCounterPaymentAllowed,
  buildPaymentPatch,
} from '#features/bookings/use_cases/record_booking_payment.use_case'
import { buildNoShowPatch } from '#features/bookings/stay_status'
import { attachCommission, toClientBooking } from '#features/commissions/booking_commission'

test.group('code d’arrivée', () => {
  test('tire un jeton et un PIN à six chiffres', ({ assert }) => {
    const code = generateArrivalCode()
    assert.match(code.check_in_pin, /^\d{6}$/)
    assert.isAtLeast(code.check_in_token.length, 20)
    assert.notEqual(generateArrivalCode().check_in_token, code.check_in_token)
  })

  test('lit le QR, le jeton seul et le PIN tel qu’affiché', ({ assert }) => {
    const { check_in_token: token } = generateArrivalCode()
    assert.deepEqual(parseArrivalCode(`${ARRIVAL_QR_PREFIX}${token}`), {
      kind: 'token',
      value: token,
    })
    assert.deepEqual(parseArrivalCode(token), { kind: 'token', value: token })
    assert.deepEqual(parseArrivalCode(' 245-252 '), { kind: 'pin', value: '245252' })
  })

  test('rejette ce qui n’est pas un code de RESI', ({ assert }) => {
    assert.isNull(parseArrivalCode('https://example.com'))
    assert.isNull(parseArrivalCode('1234'))
  })

  test('n’est lu que dans la vue du client', ({ assert }) => {
    const dto = attachArrival(
      attachCommission(
        {
          total_amount: 90000,
          daily_price: 30000,
          subtotal_amount: 90000,
          discount_amount: 0,
          promo_code: null,
          sponsorship_credit_amount: 0,
          amount_due: 90000,
          list_daily_price: null,
          payment_option: 'deposit' as const,
          balance_due: 70000,
          deposit_amount: 0,
        },
        {
          mode: 'percent',
          value: 11.12,
          amount: 10000,
          client_daily_price: 33334,
          client_subtotal_amount: 100000,
          client_total_amount: 100000,
          net_amount: 10000,
          discount_amount: 0,
          promo_code: null,
        }
      ),
      readBookingArrival({
        check_in_token: 'abcdefghijklmnopqrstuv',
        check_in_pin: '245252',
        online_deposit_amount: 30000,
      })
    )
    // Le propriétaire reçoit le DTO sérialisé : ni code ni acompte client.
    const ownerView = JSON.parse(JSON.stringify(dto))
    assert.notProperty(ownerView, 'arrival_pin')
    assert.notProperty(ownerView, 'online_deposit_amount')

    const client = toClientBooking(dto)
    assert.equal(client.arrival_qr, `${ARRIVAL_QR_PREFIX}abcdefghijklmnopqrstuv`)
    assert.equal(client.arrival_pin, '245252')
    assert.equal(client.amount_due, 30000)
    // Le client lit le même reste que le propriétaire.
    assert.equal(client.balance_due, 70000)
  })
})

test.group('remise des clés', () => {
  test('refuse une réservation en ligne sans paiement encaissé', ({ assert }) => {
    assert.throws(() => assertArrivalPaid({ total_amount: 90000 }, false), /en ligne/)
  })

  test('refuse un acompte dont le reste n’est pas soldé', ({ assert }) => {
    const booking = {
      payment_option: 'deposit' as const,
      total_amount: 90000,
      prepaid_amount: 20000,
      deposit_amount: 40000,
    }
    assert.throws(() => assertArrivalPaid(booking, true), /30000 F/)
    assert.doesNotThrow(() => assertArrivalPaid({ ...booking, deposit_amount: 70000 }, true))
  })

  test('laisse le comptoir tel qu’il était', ({ assert }) => {
    assert.doesNotThrow(() =>
      assertArrivalPaid({ source: 'offline', total_amount: 40000, deposit_amount: 0 }, false)
    )
  })
})

test.group('encaissement au comptoir', () => {
  test('n’encaisse rien sur une réservation réglée en ligne', ({ assert }) => {
    assert.throws(() => assertCounterPaymentAllowed({ payment_option: 'full' }), /en ligne/)
  })

  test('attend que l’acompte soit payé', ({ assert }) => {
    assert.throws(
      () => assertCounterPaymentAllowed({ payment_option: 'deposit', prepaid_amount: 0 }),
      /acompte/
    )
    assert.doesNotThrow(() =>
      assertCounterPaymentAllowed({ payment_option: 'deposit', prepaid_amount: 20000 })
    )
  })

  test('déduit l’acompte payé en ligne du reste dû', ({ assert }) => {
    const booking = { total_amount: 90000, prepaid_amount: 20000 }
    assert.deepEqual(buildPaymentPatch(booking, 70000), { deposit_amount: 70000 })
    assert.throws(() => buildPaymentPatch(booking, 80000), /70000 F/)
  })
})

test.group('client absent', () => {
  test('ramène le revenu d’un acompte à ce que le propriétaire a reçu', ({ assert }) => {
    assert.deepEqual(
      buildNoShowPatch({
        status: 'confirmed',
        payment_option: 'deposit',
        total_amount: 90000,
        prepaid_amount: 20000,
      }),
      { no_show: true, planned_total_amount: 90000, total_amount: 20000 }
    )
  })

  test('garde le revenu d’un séjour payé en entier', ({ assert }) => {
    assert.deepEqual(buildNoShowPatch({ status: 'confirmed', total_amount: 90000 }), {
      no_show: true,
    })
  })

  test('ne touche ni au comptoir ni à un séjour commencé', ({ assert }) => {
    assert.deepEqual(
      buildNoShowPatch({ status: 'confirmed', source: 'offline', total_amount: 40000 }),
      {}
    )
    assert.deepEqual(buildNoShowPatch({ status: 'in_progress', total_amount: 40000 }), {})
  })
})

test.group('FindArrivalBookingUseCase', () => {
  const booking = {
    id: 'b1',
    owner_id: 'o1',
    property_id: 'p1',
    status: 'confirmed',
    source: 'online',
    payment_option: 'deposit',
    total_amount: 90000,
    prepaid_amount: 20000,
    deposit_amount: 0,
    start_date: new Date('2026-11-10T12:00:00Z'),
    end_date: new Date('2026-11-14T12:00:00Z'),
  }
  const now = new Date('2026-11-12T10:00:00Z')

  function useCase(found: Record<string, unknown> | null, pin: Record<string, unknown>[] = []) {
    return new FindArrivalBookingUseCase(
      {
        findByCheckInToken: async () => found,
        findByCheckInPin: async () => pin,
      } as never,
      { findSucceededByBooking: async () => ({ id: 'pay-1' }) } as never
    )
  }

  test('rend la réservation et le reste qui bloque l’arrivée', async ({ assert }) => {
    const result = await useCase(booking).execute(
      `${ARRIVAL_QR_PREFIX}abcdefghijklmnopqrstuv`,
      'o1',
      null,
      now
    )
    assert.isTrue(result.check.online_paid)
    assert.isFalse(result.check.can_check_in)
    assert.equal(result.check.blocker?.code, 'booking_balance_due')
  })

  test('ne révèle pas la réservation d’un autre propriétaire', async ({ assert }) => {
    await assert.rejects(
      () => useCase(booking).execute('abcdefghijklmnopqrstuv', 'o2', null, now),
      /Code non reconnu/
    )
  })

  test('reste dans le périmètre du gérant', async ({ assert }) => {
    await assert.rejects(
      () => useCase(booking).execute('abcdefghijklmnopqrstuv', 'o1', ['p2'], now),
      /Code non reconnu/
    )
  })

  test('demande le scan quand le PIN désigne deux réservations', async ({ assert }) => {
    await assert.rejects(
      () => useCase(null, [booking, { ...booking, id: 'b2' }]).execute('245252', 'o1', null, now),
      /scannez/
    )
  })
})
