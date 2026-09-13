import { test } from '@japa/runner'

import { buildExtensionPatch } from '#features/bookings/use_cases/extend_owner_booking.use_case'
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
