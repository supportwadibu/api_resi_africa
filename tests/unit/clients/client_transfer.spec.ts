import { test } from '@japa/runner'
import {
  buildClientExport,
  planClientImport,
  type ClientImportContext,
  type ExportedClient,
} from '#features/clients/client_transfer'

import type { ClientRecord } from '#models/client'

const NOW = new Date('2026-11-06T10:00:00Z')

function entry(overrides: Partial<ExportedClient> = {}): ExportedClient {
  return {
    id: 'client-1',
    owner: { id: 'old-owner', email: 'awa@exemple.ci', phone: '+2250700000000' },
    full_name: 'Mohamed Traoré',
    phone: '0712345678',
    id_document_front_public_id: 'resi/clients/front',
    id_document_back_public_id: 'resi/clients/back',
    created_at: new Date('2026-07-01T08:00:00Z'),
    updated_at: new Date('2026-08-01T08:00:00Z'),
    ...overrides,
  }
}

function context(overrides: Partial<ClientImportContext> = {}): ClientImportContext {
  return {
    owners: new Map([['old-owner', 'new-owner']]),
    existingIds: new Set(),
    existingPhones: new Set(),
    knownUserIds: new Set(),
    ...overrides,
  }
}

test.group('planClientImport', () => {
  test('rattache la fiche au propriétaire retrouvé et garde son identifiant', ({ assert }) => {
    const { records, skipped } = planClientImport([entry()], context(), NOW)

    assert.lengthOf(skipped, 0)
    assert.equal(records[0]._id, 'client-1')
    assert.equal(records[0].owner_id, 'new-owner')
  })

  test('conserve les dates d’origine et remet les statistiques à zéro', ({ assert }) => {
    // Les réservations ne survivent pas à la base vidée : des statistiques
    // reprises annonceraient des séjours introuvables.
    const [record] = planClientImport([entry()], context(), NOW).records

    assert.deepEqual(record.created_at, new Date('2026-07-01T08:00:00Z'))
    assert.deepEqual(record.updated_at, new Date('2026-08-01T08:00:00Z'))
    assert.deepEqual(record.stats, { total_stays: 0, total_paid: 0, last_stay_at: null })
  })

  test('recalcule la complétude du dossier depuis les pièces', ({ assert }) => {
    const [complete, pending] = planClientImport(
      [entry(), entry({ id: 'client-2', phone: '0799999999', id_document_back_public_id: null })],
      context(),
      NOW
    ).records

    assert.equal(complete.documents_status, 'complete')
    assert.equal(pending.documents_status, 'pending')
  })

  test('ignore une fiche dont le propriétaire est introuvable', ({ assert }) => {
    const { records, skipped } = planClientImport([entry()], context({ owners: new Map() }), NOW)

    assert.lengthOf(records, 0)
    assert.equal(skipped[0].reason, 'owner_not_found')
    assert.equal(skipped[0].line, 1)
  })

  test('est rejouable : une fiche déjà présente est ignorée', ({ assert }) => {
    const { records, skipped } = planClientImport(
      [entry()],
      context({ existingIds: new Set(['client-1']) }),
      NOW
    )

    assert.lengthOf(records, 0)
    assert.equal(skipped[0].reason, 'already_exists')
  })

  test('refuse un numéro déjà présent dans le carnet, même saisi espacé', ({ assert }) => {
    const { skipped } = planClientImport(
      [entry({ phone: '07 12 34 56 78' })],
      context({ existingPhones: new Set(['new-owner:0712345678']) }),
      NOW
    )

    assert.equal(skipped[0].reason, 'duplicate_phone')
  })

  test('refuse un doublon entre deux lignes du fichier', ({ assert }) => {
    const { records, skipped } = planClientImport(
      [entry(), entry({ id: 'client-2' })],
      context(),
      NOW
    )

    assert.lengthOf(records, 1)
    assert.deepInclude(skipped[0], { line: 2, reason: 'duplicate_phone' })
  })

  test('accepte le même numéro dans deux carnets distincts', ({ assert }) => {
    const { records } = planClientImport(
      [entry(), entry({ id: 'client-2', owner: { id: 'other-owner' } })],
      context({
        owners: new Map([
          ['old-owner', 'new-owner'],
          ['other-owner', 'other-owner'],
        ]),
      }),
      NOW
    )

    assert.lengthOf(records, 2)
  })

  test('efface `created_by` quand le gérant n’existe plus', ({ assert }) => {
    const [gone, kept] = planClientImport(
      [
        entry({ created_by: 'old-manager' }),
        entry({ id: 'client-2', phone: '0799999999', created_by: 'manager' }),
      ],
      context({ knownUserIds: new Set(['manager']) }),
      NOW
    ).records

    assert.isNull(gone.created_by)
    assert.equal(kept.created_by, 'manager')
  })
})

test.group('buildClientExport', () => {
  const record: ClientRecord = {
    _id: 'client-1',
    owner_id: 'owner-1',
    full_name: 'Mohamed Traoré',
    phone: '0712345678',
    whatsapp: null,
    id_document_type: 'cni',
    id_document_number: 'CI-123',
    id_document_front_public_id: 'resi/clients/front',
    id_document_back_public_id: null,
    documents_status: 'pending',
    stats: { total_stays: 2, total_paid: 90000, last_stay_at: new Date('2026-08-01') },
    status: 'active',
    created_at: new Date('2026-07-01'),
    updated_at: new Date('2026-08-01'),
  }

  test('embarque l’identité du propriétaire et omet les statistiques', ({ assert }) => {
    const owners = new Map([['owner-1', { id: 'owner-1', email: 'awa@exemple.ci' }]])
    const file = buildClientExport([record], owners, NOW)

    assert.equal(file.format, 'resi.clients')
    assert.equal(file.count, 1)
    assert.equal(file.clients[0].owner.email, 'awa@exemple.ci')
    assert.notProperty(file.clients[0], 'stats')
  })

  test('garde l’identifiant d’un propriétaire disparu', ({ assert }) => {
    const file = buildClientExport([record], new Map(), NOW)
    assert.deepEqual(file.clients[0].owner, { id: 'owner-1' })
  })

  test('relit sans perte une fiche sur une base vide', ({ assert }) => {
    // Aller-retour complet, sérialisation JSON comprise, comme dans le
    // back-office : le fichier écrit doit être celui que l'import relit.
    const file = JSON.parse(JSON.stringify(buildClientExport([record], new Map(), NOW)))
    const parsed = file.clients.map((c: Record<string, unknown>) => ({
      ...c,
      created_at: new Date(c.created_at as string),
      updated_at: new Date(c.updated_at as string),
    }))

    const [restored] = planClientImport(
      parsed,
      context({ owners: new Map([['owner-1', 'owner-1']]) }),
      NOW
    ).records

    assert.equal(restored.id_document_number, 'CI-123')
    assert.equal(restored.id_document_front_public_id, 'resi/clients/front')
    assert.deepEqual(restored.created_at, record.created_at)
  })
})
