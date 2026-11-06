import { test } from '@japa/runner'
import { decodeDocument, encodeDocument } from '#firebase/firestore'
import {
  ACCOUNT_SECTIONS,
  TRANSFER_STEPS,
  planStepImport,
  rebindDocument,
} from '#features/users/account_transfer'
import { Timestamp } from 'firebase-admin/firestore'

const properties = TRANSFER_STEPS.get('properties')!
const payoutNumbers = TRANSFER_STEPS.get('payout_numbers')!

test.group('Plan de transfert', () => {
  test('chaque étape est rattachée à une seule section', ({ assert }) => {
    const keys = ACCOUNT_SECTIONS.flatMap((s) => s.steps.map((step) => step.key))
    assert.equal(new Set(keys).size, keys.length)
  })

  test('le catalogue précède les réservations qui y renvoient', ({ assert }) => {
    const order = ACCOUNT_SECTIONS.map((s) => s.key)
    assert.isBelow(order.indexOf('catalog'), order.indexOf('bookings'))
    assert.isBelow(order.indexOf('catalog'), order.indexOf('client_bookings'))
  })
})

test.group('rebindDocument', () => {
  test('réécrit le seul champ de rattachement', ({ assert }) => {
    const doc = { id: 'p1', data: { owner_id: 'old', residence_id: 'r1' } }
    assert.deepEqual(rebindDocument(properties, doc, 'old', 'new'), {
      id: 'p1',
      data: { owner_id: 'new', residence_id: 'r1' },
    })
  })

  test('change l’identifiant d’un document clé par le compte', ({ assert }) => {
    const doc = { id: 'old', data: { numbers: [] } }
    assert.equal(rebindDocument(payoutNumbers, doc, 'old', 'new').id, 'new')
  })
})

test.group('planStepImport', () => {
  const input = { fromId: 'old', toId: 'new', existingIds: new Set<string>() }

  test('écarte un document d’un autre compte glissé dans le fichier', ({ assert }) => {
    const plan = planStepImport(properties, [{ id: 'p1', data: { owner_id: 'intrus' } }], input)
    assert.equal(plan.rejected, 1)
    assert.lengthOf(plan.documents, 0)
  })

  test('complète sans écraser : un identifiant présent est laissé', ({ assert }) => {
    const plan = planStepImport(
      properties,
      [
        { id: 'p1', data: { owner_id: 'old' } },
        { id: 'p2', data: { owner_id: 'old' } },
      ],
      { ...input, existingIds: new Set(['p1']) }
    )
    assert.equal(plan.existing, 1)
    assert.deepEqual(
      plan.documents.map((d) => d.data.owner_id),
      ['new']
    )
  })

  test('applique le contrôle propre à l’étape', ({ assert }) => {
    const plan = planStepImport(properties, [{ id: 'p1', data: { owner_id: 'old' } }], {
      ...input,
      accept: () => false,
    })
    assert.equal(plan.rejected, 1)
  })
})

test.group('encodeDocument', () => {
  test('fait l’aller-retour des horodatages, imbriqués compris', ({ assert }) => {
    const at = Timestamp.fromDate(new Date('2026-08-01T10:00:00Z'))
    const encoded = JSON.parse(
      JSON.stringify(encodeDocument({ created_at: at, metadata: { list: [{ at }] }, n: 3 }))
    )
    const decoded = decodeDocument(encoded)

    assert.instanceOf(decoded.created_at, Timestamp)
    assert.isTrue(decoded.metadata.list[0].at.isEqual(at))
    assert.equal(decoded.n, 3)
  })

  test('refuse un type Firestore qu’il ne sait pas restituer', ({ assert }) => {
    class GeoPoint {}
    assert.throws(() => encodeDocument({ where: new GeoPoint() }))
  })
})
