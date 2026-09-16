import { test } from '@japa/runner'

import { buildPaymentPatch } from '#features/bookings/use_cases/record_booking_payment.use_case'

test.group('buildPaymentPatch', () => {
  test('cumule le versement sur l’encaissé', ({ assert }) => {
    const patch = buildPaymentPatch({ expected_amount: 40000, received_amount: 10000 }, 15000)

    assert.equal(patch.received_amount, 25000)
  })

  test('total_amount suit l’encaissé', ({ assert }) => {
    // Finance lit `total_amount` pour le chiffre d'affaires constaté : les
    // laisser diverger ferait apparaître l'encaissement dans la fiche sans
    // qu'il n'entre jamais dans les totaux.
    const patch = buildPaymentPatch({ expected_amount: 40000, received_amount: 10000 }, 15000)

    assert.equal(patch.total_amount, patch.received_amount)
  })

  test('l’écart restant est porté en remise', ({ assert }) => {
    const patch = buildPaymentPatch({ expected_amount: 40000, received_amount: 10000 }, 15000)

    assert.equal(patch.discount_amount, 15000)
  })

  test('la remise est recalculée, jamais cumulée', ({ assert }) => {
    // Deux versements successifs menant au même encaissé doivent donner la même
    // remise qu'un versement unique : l'incrémenter la ferait dériver à chaque
    // règlement partiel.
    const enDeuxFois = buildPaymentPatch(
      buildPaymentPatch({ expected_amount: 40000, received_amount: 0 }, 10000) as {
        expected_amount?: number
        received_amount?: number
      },
      15000
    )

    assert.equal(enDeuxFois.received_amount, 25000)
  })

  test('un séjour entièrement réglé ne porte aucune remise', ({ assert }) => {
    const patch = buildPaymentPatch({ expected_amount: 40000, received_amount: 25000 }, 15000)

    assert.equal(patch.discount_amount, 0)
  })

  test('un trop-perçu ne rend jamais une remise négative', ({ assert }) => {
    const patch = buildPaymentPatch({ expected_amount: 40000, received_amount: 40000 }, 5000)

    assert.equal(patch.discount_amount, 0)
    assert.equal(patch.received_amount, 45000)
  })

  test('une réservation ancienne sans montants ne fait pas échouer le calcul', ({ assert }) => {
    // `expected_amount` et `received_amount` sont optionnels : les documents
    // antérieurs à la saisie comptoir ne les portent pas.
    const patch = buildPaymentPatch({}, 10000)

    assert.equal(patch.received_amount, 10000)
    assert.equal(patch.discount_amount, 0)
  })
})
