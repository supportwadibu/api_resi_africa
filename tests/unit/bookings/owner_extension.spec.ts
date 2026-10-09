import { test } from '@japa/runner'

import {
  buildExtensionPatch,
  extendedAgreedAmount,
} from '#features/bookings/use_cases/extend_owner_booking.use_case'
import { resolveAgreedAmount } from '#features/bookings/use_cases/create_owner_booking.use_case'
import { splitRevenueByMonth } from '#features/finance/revenue_split'

const d = (iso: string) => new Date(iso)

test.group('buildExtensionPatch', () => {
  const nouvelleSortie = d('2026-10-06T12:00:00Z')

  test('réajuste le montant encaissé sur le nouveau montant attendu', ({ assert }) => {
    // Le bug : un séjour prolongé sans réajustement laissait Finance voir un
    // impayé. 5 jours à 10 000 F, encaissés en totalité.
    const patch = buildExtensionPatch(nouvelleSortie, 5, 50000, 50000)

    assert.equal(patch.expected_amount, 50000)
    assert.equal(patch.received_amount, 50000)
    assert.equal(patch.total_amount, 50000)
    assert.equal(patch.discount_amount, 0)
  })

  test('ne laisse pas le montant encaissé en dessous de l’attendu par inadvertance', ({
    assert,
  }) => {
    // Contre-épreuve du bug : si `received_amount` restait à sa valeur
    // d'origine (20 000 F pour 2 jours) alors que l'attendu passe à 50 000 F,
    // l'écart apparaîtrait comme une remise de 30 000 F jamais consentie.
    const patch = buildExtensionPatch(nouvelleSortie, 5, 50000, 50000)

    assert.notEqual(patch.received_amount, 20000)
    assert.equal(patch.discount_amount, 0)
  })

  test('un montant renégocié inférieur devient une remise consentie', ({ assert }) => {
    // Le propriétaire accorde 45 000 F au lieu de 50 000 : même règle que la
    // création comptoir, l’écart est une remise, pas un impayé.
    const patch = buildExtensionPatch(nouvelleSortie, 5, 50000, 45000)

    assert.equal(patch.expected_amount, 50000)
    assert.equal(patch.received_amount, 45000)
    assert.equal(patch.total_amount, 45000)
    assert.equal(patch.discount_amount, 5000)
  })

  test('un montant encaissé supérieur à l’attendu ne crée pas de remise négative', ({ assert }) => {
    const patch = buildExtensionPatch(nouvelleSortie, 5, 50000, 55000)

    assert.equal(patch.discount_amount, 0)
  })

  test('repousse les deux bornes de sortie ensemble', ({ assert }) => {
    // `end_date` et `check_out_at` sont tenus identiques : `end_date` reste la
    // source pour Finance, `check_out_at` pour les écrans comptoir.
    const patch = buildExtensionPatch(nouvelleSortie, 5, 50000, 50000)

    assert.deepEqual(patch.end_date, nouvelleSortie)
    assert.deepEqual(patch.check_out_at, nouvelleSortie)
  })

  test('ne touche ni start_date ni check_in_at', ({ assert }) => {
    // Une prolongation ne déplace que la sortie. Réécrire l’entrée changerait
    // la répartition mensuelle du revenu déjà constatée.
    const patch = buildExtensionPatch(nouvelleSortie, 5, 50000, 50000)

    assert.notProperty(patch, 'start_date')
    assert.notProperty(patch, 'check_in_at')
  })

  test('ne réécrit pas le statut', ({ assert }) => {
    // Un séjour `in_progress` prolongé reste en cours ; le repasser à
    // `confirmed` ferait régresser le cycle de vie.
    const patch = buildExtensionPatch(nouvelleSortie, 5, 50000, 50000)

    assert.notProperty(patch, 'status')
  })

  test('la répartition du revenu suit la nouvelle période', ({ assert }) => {
    // Séjour du 28 octobre au 2 novembre prolongé au 5 novembre : le revenu
    // supplémentaire doit tomber en novembre, pas en octobre.
    const debut = d('2026-10-28T12:00:00Z')
    const patch = buildExtensionPatch(d('2026-11-05T12:00:00Z'), 8, 80000, 80000)

    const parts = splitRevenueByMonth(debut, patch.end_date as Date, patch.total_amount as number)

    assert.equal(parts.length, 2)
    assert.equal(parts[0].days, 4)
    assert.equal(parts[1].days, 4)
    assert.equal(parts[0].amount + parts[1].amount, 80000)
  })
})

test.group('extendedAgreedAmount', () => {
  test('un prix négocié prolonge au tarif journalier convenu', ({ assert }) => {
    // 3 jours négociés à 45 000 F (15 000 F/j) au lieu de 60 000 F :
    // 2 jours de plus coûtent 30 000 F, pas 40 000 F de grille.
    const amount = extendedAgreedAmount(
      { days: 3, expected: 60000, received: 45000 },
      { days: 5, expected: 100000 }
    )
    assert.equal(amount, 75000)
  })

  test('sans négociation, la grille s’applique, paliers compris', ({ assert }) => {
    // 5 jours au tarif, prolongés à 10 : le palier de durée joue sur la grille.
    const amount = extendedAgreedAmount(
      { days: 5, expected: 100000, received: 100000 },
      { days: 10, expected: 170000 }
    )
    assert.equal(amount, 170000)
  })

  test('arrondit au franc', ({ assert }) => {
    const amount = extendedAgreedAmount(
      { days: 3, expected: 60000, received: 50000 },
      { days: 4, expected: 80000 }
    )
    assert.equal(amount, 66667)
  })

  test('une réservation sans jours enregistrés retombe sur la grille', ({ assert }) => {
    const amount = extendedAgreedAmount(
      { days: 0, expected: 60000, received: 45000 },
      { days: 5, expected: 100000 }
    )
    assert.equal(amount, 100000)
  })

  test('le prix unitaire figé fait foi, même si le total a été compté sur un autre nombre de jours', ({
    assert,
  }) => {
    // Le cas remonté du terrain : 15 000 F/j convenus sur une grille à
    // 20 000 F. Le mobile a compté 1 jour (15 000 F), le serveur 2 : le
    // quotient donnait 7 500 F le jour. Prolongé à 3 jours : 45 000 F.
    const amount = extendedAgreedAmount(
      { days: 2, expected: 40000, received: 15000, agreedUnitPrice: 15000 },
      { days: 3, expected: 60000 }
    )
    assert.equal(amount, 45000)
  })

  test('un prix unitaire égal à la grille reste le prix convenu', ({ assert }) => {
    // Le propriétaire a saisi un prix : il s'applique aux jours ajoutés, même
    // si un palier de durée aurait fait baisser la grille.
    const amount = extendedAgreedAmount(
      { days: 2, expected: 40000, received: 40000, agreedUnitPrice: 20000 },
      { days: 7, expected: 126000 }
    )
    assert.equal(amount, 140000)
  })
})

test.group('resolveAgreedAmount', () => {
  test('le total suit le prix unitaire sur la durée du serveur', ({ assert }) => {
    const result = resolveAgreedAmount(
      { agreed_unit_price: 15000, received_amount: 15000 },
      { days: 2, expected: 40000 }
    )
    assert.deepEqual(result, { received: 30000, agreedUnitPrice: 15000 })
  })

  test('un total seul, envoyé par un appareil plus ancien, est repris tel quel', ({ assert }) => {
    const result = resolveAgreedAmount({ received_amount: 35000 }, { days: 2, expected: 40000 })
    assert.deepEqual(result, { received: 35000, agreedUnitPrice: null })
  })

  test('sans prix convenu, le montant attendu s’applique', ({ assert }) => {
    const result = resolveAgreedAmount({}, { days: 2, expected: 40000 })
    assert.deepEqual(result, { received: 40000, agreedUnitPrice: null })
  })
})
