import { test } from '@japa/runner'

import { buildOwnerBookingPayload } from '#models/booking'
import { buildClientPayload } from '#models/client'
import { withDefaults as buildExpensePayload } from '#models/expense'

import type { OwnerBookingInput } from '#models/booking'

/**
 * L'auteur d'une saisie se perd en silence.
 *
 * Les trois compositions de document énumèrent leurs champs un à un. Un
 * `created_by` calculé en amont s'y perd alors **sans la moindre erreur de
 * compilation** : le champ est simplement absent de l'objet littéral, et
 * TypeScript n'a rien à redire à un objet auquel il manque une propriété
 * optionnelle.
 *
 * Perdre l'auteur ne casse rien de visible : la réservation s'enregistre, la
 * fiche se crée. Mais une fiche saisie au comptoir devient invisible à son
 * créateur tant qu'elle n'a pas de réservation — c'est `created_by` qui la
 * retient dans le carnet du gérant —, et la traçabilité d'audit disparaît.
 * Rien de tout cela ne se voit à la relecture. Le seul recours est un test qui
 * regarde la charge utile réellement construite.
 */
test.group('l’auteur descend jusqu’à la charge utile', () => {
  test('booking comptoir : created_by arrive dans le document', ({ assert }) => {
    const payload = buildOwnerBookingPayload(ownerBookingInput('gerant-1'), new Date())

    assert.equal(payload.created_by, 'gerant-1')
    // L'audit ne déplace jamais la propriété : le propriétaire reste titulaire.
    assert.equal(payload.owner_id, 'owner-1')
  })

  test('booking comptoir : une saisie du propriétaire ne porte pas d’auteur', ({ assert }) => {
    const payload = buildOwnerBookingPayload(ownerBookingInput(null), new Date())

    assert.isNull(payload.created_by)
  })

  test('booking comptoir : un auteur absent vaut null, jamais undefined', ({ assert }) => {
    // `undefined` ne se sérialise pas dans Firestore : le champ disparaîtrait
    // du document. Un `null` explicite dit « saisi par le propriétaire », ce
    // que `readCreatedBy` sait relire.
    const input = ownerBookingInput(null)
    delete input.created_by

    assert.isNull(buildOwnerBookingPayload(input, new Date()).created_by)
  })

  test('client : created_by arrive dans le document', ({ assert }) => {
    const payload = buildClientPayload(
      { owner_id: 'owner-1', full_name: 'Awa', phone: '0700000000', created_by: 'gerant-1' },
      new Date()
    )

    assert.equal(payload.created_by, 'gerant-1')
    assert.equal(payload.owner_id, 'owner-1')
  })

  test('client : une saisie du propriétaire ne porte pas d’auteur', ({ assert }) => {
    const payload = buildClientPayload(
      { owner_id: 'owner-1', full_name: 'Awa', phone: '0700000000' },
      new Date()
    )

    assert.isNull(payload.created_by)
  })

  test('expense : created_by arrive dans le document', ({ assert }) => {
    const payload = buildExpensePayload({
      owner_id: 'owner-1',
      property_id: 'studio-1',
      category: 'maintenance',
      amount: 5000,
      spent_at: new Date('2026-01-15'),
      created_by: 'gerant-1',
    })

    assert.equal(payload.created_by, 'gerant-1')
    assert.equal(payload.owner_id, 'owner-1')
  })

  test('expense : une saisie du propriétaire ne porte pas d’auteur', ({ assert }) => {
    const payload = buildExpensePayload({
      owner_id: 'owner-1',
      property_id: 'studio-1',
      category: 'maintenance',
      amount: 5000,
      spent_at: new Date('2026-01-15'),
    })

    assert.isNull(payload.created_by)
  })
})

/** Réservation comptoir réduite aux champs que la composition recopie. */
function ownerBookingInput(createdBy: string | null): OwnerBookingInput {
  return {
    owner_id: 'owner-1',
    property_id: 'studio-1',
    residence_id: null,
    client_id: 'client-1',
    client_snapshot: { full_name: 'Awa', phone: '0700000000' },
    status: 'confirmed',
    stay_type: 'full_day',
    check_in_at: new Date('2026-02-01T12:00:00.000Z'),
    check_out_at: new Date('2026-02-03T12:00:00.000Z'),
    days_count: 2,
    daily_price: 20000,
    expected_amount: 40000,
    received_amount: 40000,
    deposit_amount: 0,
    message: null,
    client_request_id: null,
    created_by: createdBy,
  }
}
