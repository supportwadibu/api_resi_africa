import { test } from '@japa/runner'

import { resolveUnitAddress } from '#features/properties/use_cases/create_property.use_case'

const residence = {
  address: {
    street: 'Rue des Jardins',
    city: 'Abidjan',
    country: 'CI',
    postal_code: '01 BP 1234',
    coordinates: { latitude: 5.36, longitude: -4.0083 },
  },
}

test.group('resolveUnitAddress', () => {
  test('copie l’adresse de la résidence quand l’unité n’en fournit pas', ({ assert }) => {
    // Décision de conception : l'adresse est dupliquée sur l'unité, Firestore
    // n'ayant pas de jointure pour la résoudre à l'affichage.
    const address = resolveUnitAddress(undefined, residence)

    assert.equal(address?.street, 'Rue des Jardins')
    assert.equal(address?.city, 'Abidjan')
    assert.equal(address?.country, 'CI')
    assert.equal(address?.coordinates?.latitude, 5.36)
  })

  test('une adresse fournie explicitement prime sur celle de la résidence', ({ assert }) => {
    // Deux bâtiments d'une même résidence peuvent être sur deux rues.
    const address = resolveUnitAddress(
      { street: 'Boulevard Lagunaire', city: 'Abidjan' },
      residence
    )

    assert.equal(address?.street, 'Boulevard Lagunaire')
  })

  test('sans résidence ni adresse, rien n’est résolu', ({ assert }) => {
    // Le use case en fait un 422 : un bien autonome doit porter son adresse.
    assert.isUndefined(resolveUnitAddress(undefined, null))
  })

  test('un bien autonome garde son adresse', ({ assert }) => {
    const address = resolveUnitAddress({ street: 'Rue A', city: 'Bouaké' }, null)

    assert.equal(address?.street, 'Rue A')
    assert.equal(address?.city, 'Bouaké')
  })

  test('un code postal absent de la résidence ne devient pas la chaîne « null »', ({ assert }) => {
    const sansCodePostal = {
      address: { ...residence.address, postal_code: null },
    }

    const address = resolveUnitAddress(undefined, sansCodePostal)

    assert.isUndefined(address?.postal_code)
  })

  test('des coordonnées absentes restent absentes', ({ assert }) => {
    const sansCoords = {
      address: {
        ...residence.address,
        coordinates: { latitude: null, longitude: null },
      },
    }

    const address = resolveUnitAddress(undefined, sansCoords)

    assert.isUndefined(address?.coordinates?.latitude)
    assert.isUndefined(address?.coordinates?.longitude)
  })
})
