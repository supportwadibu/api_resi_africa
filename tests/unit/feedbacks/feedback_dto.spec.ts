import { FeedbackRepository } from '#features/feedbacks/repositories/feedback_repository'
import { test } from '@japa/runner'

import type { FeedbackRecord } from '#models/feedback'

const record: FeedbackRecord = {
  _id: 'feedback-1',
  user_id: 'user-1',
  user_snapshot: {
    full_name: 'Mohamed Traoré',
    phone: '0712345678',
    email: 'mohamed@example.com',
  },
  type: 'bug',
  title: 'Le calendrier reste vide',
  message: 'Quand j’ouvre la disponibilité d’un bien, aucune date ne s’affiche.',
  status: 'read',
  admin_note: 'Reproduit sur Android 12, corrigé en 1.4.2.',
  context: {
    app_version: '1.4.1',
    flavor: 'prod',
    platform: 'android',
    os_version: '12',
    device_model: 'Tecno Spark 8',
  },
  created_at: new Date('2026-09-01'),
  updated_at: new Date('2026-09-02'),
}

test.group('FeedbackRepository.toDto', () => {
  test('expose l’identifiant sous le nom `id`', ({ assert }) => {
    assert.equal(FeedbackRepository.toDto(record).id, 'feedback-1')
  })

  test('n’expose jamais la note interne à l’auteur', ({ assert }) => {
    // La note est écrite par l'équipe pour l'équipe : la renvoyer dans
    // l'historique du propriétaire lui livrerait des échanges internes.
    const dto = FeedbackRepository.toDto(record) as unknown as Record<string, unknown>
    assert.notProperty(dto, 'admin_note')
  })

  test('n’expose ni l’auteur ni le contexte technique à l’auteur', ({ assert }) => {
    // Il connaît sa propre identité, et le contexte est collecté sans qu'il
    // le voie : le lui renvoyer exposerait la structure interne sans usage.
    const dto = FeedbackRepository.toDto(record) as unknown as Record<string, unknown>
    assert.notProperty(dto, 'user_snapshot')
    assert.notProperty(dto, 'user_id')
    assert.notProperty(dto, 'context')
  })

  test('reporte le type, le titre et le message tels quels', ({ assert }) => {
    const dto = FeedbackRepository.toDto(record)
    assert.equal(dto.type, 'bug')
    assert.equal(dto.title, 'Le calendrier reste vide')
    assert.equal(dto.status, 'read')
  })

  test('présente comme non traité un document sans `status`', ({ assert }) => {
    // `status` est arrivé avec le back-office : les premiers avis enregistrés
    // n'en portent pas et ne doivent pas se présenter sans statut.
    const legacy = { ...record } as Record<string, unknown>
    delete legacy.status

    const dto = FeedbackRepository.toDto(legacy as unknown as FeedbackRecord)
    assert.equal(dto.status, 'new')
  })
})

test.group('FeedbackRepository.toAdminDto', () => {
  test('livre l’auteur, la note interne et le contexte', ({ assert }) => {
    const dto = FeedbackRepository.toAdminDto(record)
    assert.equal(dto.user_id, 'user-1')
    assert.equal(dto.user_snapshot.full_name, 'Mohamed Traoré')
    assert.equal(dto.admin_note, 'Reproduit sur Android 12, corrigé en 1.4.2.')
    assert.equal(dto.context.app_version, '1.4.1')
  })

  test('complète un contexte absent par des valeurs nulles', ({ assert }) => {
    // Un avis envoyé par une version antérieure à la collecte du contexte doit
    // rester lisible dans le back-office, pas faire échouer la liste.
    const legacy = { ...record } as Record<string, unknown>
    delete legacy.context

    const dto = FeedbackRepository.toAdminDto(legacy as unknown as FeedbackRecord)
    assert.isNull(dto.context.app_version)
    assert.isNull(dto.context.platform)
    assert.isNull(dto.context.device_model)
  })

  test('complète un auteur absent sans lever', ({ assert }) => {
    const legacy = { ...record } as Record<string, unknown>
    delete legacy.user_snapshot

    const dto = FeedbackRepository.toAdminDto(legacy as unknown as FeedbackRecord)
    assert.equal(dto.user_snapshot.full_name, '')
    assert.isNull(dto.user_snapshot.phone)
  })
})
