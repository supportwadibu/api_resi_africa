import { test } from '@japa/runner'
import { buildReportGenerationDocument } from '#features/reports/repositories/report_generation_repository'

test.group('buildReportGenerationDocument', () => {
  test('assemble le document à partir de l’entrée et de l’horodatage fourni', ({ assert }) => {
    const now = new Date('2026-04-01T08:00:00.000Z')

    const doc = buildReportGenerationDocument(
      {
        owner_id: 'owner-1',
        type: 'financial',
        residence_id: 'residence-1',
        period_from: new Date('2026-03-01T00:00:00.000Z'),
        period_to: new Date('2026-04-01T00:00:00.000Z'),
        file_size: 48213,
      },
      now
    )

    assert.deepEqual(doc, {
      owner_id: 'owner-1',
      type: 'financial',
      residence_id: 'residence-1',
      period_from: new Date('2026-03-01T00:00:00.000Z'),
      period_to: new Date('2026-04-01T00:00:00.000Z'),
      file_size: 48213,
      created_at: now,
    })
  })

  test('conserve `residence_id` à `null` pour un rapport sur tout le parc', ({ assert }) => {
    const doc = buildReportGenerationDocument({
      owner_id: 'owner-1',
      type: 'performance',
      residence_id: null,
      period_from: new Date('2026-01-01T00:00:00.000Z'),
      period_to: new Date('2026-02-01T00:00:00.000Z'),
      file_size: 12000,
    })

    assert.isNull(doc.residence_id)
  })

  test('horodate au moment de l’appel quand aucun `now` n’est fourni', ({ assert }) => {
    const before = Date.now()

    const doc = buildReportGenerationDocument({
      owner_id: 'owner-1',
      type: 'reservations',
      residence_id: null,
      period_from: new Date('2026-01-01T00:00:00.000Z'),
      period_to: new Date('2026-02-01T00:00:00.000Z'),
      file_size: 500,
    })

    const after = Date.now()

    assert.isAtLeast(doc.created_at.getTime(), before)
    assert.isAtMost(doc.created_at.getTime(), after)
  })
})
