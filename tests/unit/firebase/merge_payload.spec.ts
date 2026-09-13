import { test } from '@japa/runner'
import { Timestamp } from 'firebase-admin/firestore'

import { toMergePayload, toPayload } from '#firebase/firestore'

test.group('toMergePayload', () => {
  test('aplatit un objet imbriqué en chemins pointés', ({ assert }) => {
    // C'est tout l'enjeu : `update({ details: { bedrooms: 3 } })` remplace
    // l'objet `details` entier chez Firestore, alors que
    // `update({ 'details.bedrooms': 3 })` ne touche que ce champ.
    const payload = toMergePayload({ details: { bedrooms: 3 } })

    assert.deepEqual(payload, { 'details.bedrooms': 3 })
    assert.notProperty(payload, 'details')
  })

  test('un patch sur daily_price n’émet aucun chemin price_tiers', ({ assert }) => {
    // Le cas le plus coûteux du bug : envoyer `{ pricing: { daily_price } }`
    // supprimait `price_tiers`, `minimum_stay_days` et `maximum_stay_days` —
    // toute la grille de remises disparaissait sans erreur.
    const payload = toMergePayload({ pricing: { daily_price: 25000 } })

    assert.deepEqual(payload, { 'pricing.daily_price': 25000 })
    assert.notProperty(payload, 'pricing')
    assert.notInclude(Object.keys(payload), 'pricing.price_tiers')
  })

  test('aplatit sur plusieurs niveaux', ({ assert }) => {
    const payload = toMergePayload({ address: { coordinates: { latitude: 5.36 } } })

    assert.deepEqual(payload, { 'address.coordinates.latitude': 5.36 })
  })

  test('laisse les champs de premier niveau intacts', ({ assert }) => {
    const payload = toMergePayload({ title: 'Resi Adja', additional_charges: 0 })

    assert.deepEqual(payload, { title: 'Resi Adja', additional_charges: 0 })
  })

  test('remplace un tableau en entier', ({ assert }) => {
    // `price_tiers` envoyé par le propriétaire est la liste complète, pas un
    // ajout : le tableau est une valeur terminale.
    const tiers = [{ min_days: 7, discount_percent: 10 }]
    const payload = toMergePayload({ pricing: { price_tiers: tiers } })

    assert.deepEqual(payload, { 'pricing.price_tiers': tiers })
  })

  test('convertit les Date en Timestamp', ({ assert }) => {
    const payload = toMergePayload({ available_from: new Date('2026-10-01T12:00:00Z') })

    assert.instanceOf(payload.available_from, Timestamp)
  })

  test('convertit une Date imbriquée et garde le chemin pointé', ({ assert }) => {
    const payload = toMergePayload({
      visibility: { published_at: new Date('2026-10-01T12:00:00Z') },
    })

    assert.instanceOf(payload['visibility.published_at'], Timestamp)
  })

  test('un null est un effacement voulu, pas un objet à parcourir', ({ assert }) => {
    const payload = toMergePayload({ details: { floor_number: null } })

    assert.deepEqual(payload, { 'details.floor_number': null })
  })

  test('un objet vide n’émet aucun chemin', ({ assert }) => {
    // Émettre le chemin parent écraserait l'objet existant — exactement le bug
    // que la fonction corrige.
    const payload = toMergePayload({ amenities: {}, title: 'Resi Adja' })

    assert.deepEqual(payload, { title: 'Resi Adja' })
  })

  test('retire `_id` comme toPayload', ({ assert }) => {
    const payload = toMergePayload({ _id: 'abc', title: 'Resi Adja' })

    assert.deepEqual(payload, { title: 'Resi Adja' })
  })

  test('toPayload écrase toujours l’objet imbriqué, lui', ({ assert }) => {
    // Contre-épreuve : `toPayload` reste le bon outil pour une création, où le
    // document est écrit en entier. C'est son usage sur un patch partiel qui
    // était fautif.
    const payload = toPayload({ pricing: { daily_price: 25000 } })

    assert.property(payload, 'pricing')
    // `notProperty` lirait le point comme un chemin imbriqué : on interroge la
    // liste des clés littérales.
    assert.notInclude(Object.keys(payload), 'pricing.daily_price')
  })
})
