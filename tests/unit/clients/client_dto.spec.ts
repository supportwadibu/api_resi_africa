import { test } from '@japa/runner'
import { ClientRepository } from '#features/clients/repositories/client_repository'

import type { ClientRecord } from '#models/client'

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

test.group('ClientRepository.toDto', () => {
  test('expose l’identifiant sous le nom `id`', ({ assert }) => {
    assert.equal(ClientRepository.toDto(record).id, 'client-1')
  })

  test('n’expose jamais les identifiants Cloudinary', ({ assert }) => {
    // Ce sont des références internes : les livrer permettrait de forger des
    // requêtes vers l'hébergeur en dehors des URLs signées.
    const dto = ClientRepository.toDto(record) as unknown as Record<string, unknown>
    assert.notProperty(dto, 'id_document_front_public_id')
    assert.notProperty(dto, 'id_document_back_public_id')
  })

  test('n’expose pas `owner_id`', ({ assert }) => {
    // La fiche est lue par son propre propriétaire : redire à qui elle
    // appartient n'apporte rien et expose la structure interne.
    const dto = ClientRepository.toDto(record) as unknown as Record<string, unknown>
    assert.notProperty(dto, 'owner_id')
  })

  test('signale la présence des pièces sans livrer leur référence', ({ assert }) => {
    const dto = ClientRepository.toDto(record)
    assert.isTrue(dto.has_document_front)
    assert.isFalse(dto.has_document_back)
    assert.equal(dto.documents_status, 'pending')
  })

  test('reporte les statistiques de séjour', ({ assert }) => {
    const dto = ClientRepository.toDto(record)
    assert.equal(dto.stats.total_stays, 2)
    assert.equal(dto.stats.total_paid, 90000)
  })

  test('une fiche sans statistiques ne fait pas échouer la lecture', ({ assert }) => {
    // Les fiches écrites avant l'ajout du bloc `stats` n'en portent pas.
    const legacy = { ...record, stats: undefined } as unknown as ClientRecord
    const dto = ClientRepository.toDto(legacy)
    assert.equal(dto.stats.total_stays, 0)
    assert.isNull(dto.stats.last_stay_at)
  })
})

/**
 * `created_by` doit traverser la conversion.
 *
 * `toDto` énumère ses champs un à un : l'oublier ne casse rien de visible, mais
 * c'est ce champ qui retient une fiche dans le carnet de son créateur tant
 * qu'elle n'a aucune réservation. Perdu ici, une fiche saisie au comptoir
 * disparaîtrait de la liste du gérant entre sa création et la réservation
 * qu'elle sert — sans la moindre erreur.
 */
test.group('ClientRepository.toDto — auteur de la saisie', () => {
  test('reporte l’auteur quand la fiche en porte un', ({ assert }) => {
    const dto = ClientRepository.toDto({ ...record, created_by: 'gerant-1' })

    assert.equal(dto.created_by, 'gerant-1')
  })

  test('rend null sur une fiche antérieure au rôle gérant', ({ assert }) => {
    // Absent signifie « saisie par le propriétaire », seul acteur possible
    // avant cette version.
    assert.isNull(ClientRepository.toDto(record).created_by)
  })

  test('rend null sur une valeur nulle explicite', ({ assert }) => {
    assert.isNull(ClientRepository.toDto({ ...record, created_by: null }).created_by)
  })
})
