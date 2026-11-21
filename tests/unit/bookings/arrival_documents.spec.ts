import { test } from '@japa/runner'

import {
  hasArrivalDocuments,
  RecordArrivalDocumentsUseCase,
} from '#features/bookings/use_cases/record_arrival_documents.use_case'

const front = { clientName: 'recto.jpg' } as never

function carnetRecord(id: string, ownerId: string) {
  return {
    _id: id,
    owner_id: ownerId,
    full_name: 'Awa Koné',
    phone: '0700000000',
    whatsapp: null,
    id_document_type: null,
    id_document_number: null,
    id_document_front_public_id: null,
    id_document_back_public_id: null,
    documents_status: 'pending',
    stats: { total_stays: 0, total_paid: 0, last_stay_at: null },
    status: 'active',
    created_at: new Date(),
    updated_at: new Date(),
  }
}

function useCase(options: {
  booking?: Record<string, unknown> | null
  carnetById?: Record<string, unknown> | null
  carnetByPhone?: Record<string, unknown> | null
  user?: { full_name: string; phone: string | null } | null
}) {
  const created: Array<Record<string, unknown>> = []
  const updated: Array<{ id: string; ownerId: string; input: Record<string, unknown> }> = []
  const record = new RecordArrivalDocumentsUseCase(
    {
      bookings: {
        findById: async () =>
          options.booking === undefined
            ? { id: 'b1', owner_id: 'o1', client_id: 'u1' }
            : options.booking,
      } as never,
      clients: {
        findById: async () => options.carnetById ?? null,
        findByPhone: async () => options.carnetByPhone ?? null,
      } as never,
      users: {
        findEntity: async () =>
          options.user === undefined
            ? { full_name: 'Awa Koné', phone: '0700000000' }
            : options.user,
      } as never,
    },
    {
      execute: async (input: Record<string, unknown>) => {
        created.push(input)
        return { client: { id: 'new-card' }, already_existed: false }
      },
    } as never,
    {
      execute: async (id: string, ownerId: string, input: Record<string, unknown>) => {
        updated.push({ id, ownerId, input })
        return { id }
      },
    } as never
  )
  return { record, created, updated }
}

const documents = { id_document_type: 'cni' as const, id_document_number: 'CI123' }

test.group('RecordArrivalDocumentsUseCase', () => {
  test('client de l’app sans fiche : la fiche naît dans le carnet du propriétaire', async ({
    assert,
  }) => {
    const { record, created, updated } = useCase({})
    await record.execute({ booking_id: 'b1', owner_id: 'o1', documents, files: { front } })

    assert.lengthOf(created, 1)
    assert.equal(created[0].owner_id, 'o1')
    assert.equal(created[0].phone, '0700000000')
    assert.deepEqual(updated[0], { id: 'new-card', ownerId: 'o1', input: documents })
  })

  test('fiche déjà au carnet, retrouvée par le numéro : complétée sans doublon', async ({
    assert,
  }) => {
    const { record, created, updated } = useCase({ carnetByPhone: carnetRecord('card-7', 'o1') })
    await record.execute({ booking_id: 'b1', owner_id: 'o1', documents, files: { front } })

    assert.lengthOf(created, 0)
    assert.equal(updated[0].id, 'card-7')
  })

  test('saisie comptoir : la fiche de la réservation est complétée', async ({ assert }) => {
    const { record, updated } = useCase({ carnetById: carnetRecord('card-1', 'o1') })
    await record.execute({ booking_id: 'b1', owner_id: 'o1', documents, files: { front } })
    assert.equal(updated[0].id, 'card-1')
  })

  test('réservation d’un autre propriétaire : 404, rien n’est écrit', async ({ assert }) => {
    const { record, created, updated } = useCase({})
    await assert.rejects(
      () => record.execute({ booking_id: 'b1', owner_id: 'o2', documents, files: { front } }),
      /Réservation introuvable/
    )
    assert.lengthOf(created, 0)
    assert.lengthOf(updated, 0)
  })

  test('compte sans numéro : refus explicite', async ({ assert }) => {
    const { record } = useCase({ user: { full_name: 'Awa', phone: null } })
    await assert.rejects(
      () => record.execute({ booking_id: 'b1', owner_id: 'o1', documents, files: { front } }),
      /numéro de téléphone/
    )
  })
})

test.group('hasArrivalDocuments', () => {
  test('nature de la pièce et recto suffisent', ({ assert }) => {
    assert.isTrue(hasArrivalDocuments({ id_document_type: 'passeport', has_document_front: true }))
    assert.isFalse(hasArrivalDocuments({ id_document_type: null, has_document_front: true }))
    assert.isFalse(hasArrivalDocuments({ id_document_type: 'cni', has_document_front: false }))
    assert.isFalse(hasArrivalDocuments(null))
  })
})
