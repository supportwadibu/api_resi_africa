import { test } from '@japa/runner'
import { renderPerformanceReport } from '#features/reports/renderers/performance_report'

const context = {
  owner_name: 'Kouassi',
  residence_name: 'Les Cocotiers',
  period: {
    window: { from: new Date('2026-03-01T00:00:00Z'), to: new Date('2026-04-01T00:00:00Z') },
    label: 'Mars 2026',
    from_date: '2026-03-01',
    to_date: '2026-03-31',
  },
  generated_at: new Date('2026-04-02T09:30:00Z'),
}

const data = {
  occupied_days: 22,
  available_days: 31,
  average_stay: 4.5,
  gross_revenue: 620000,
  monthly_occupancy: [{ month: 'Mars', ratio: 0.71 }],
  properties: [
    { property_title: 'Studio A', occupied_days: 15, available_days: 31, gross_revenue: 400000 },
    { property_title: 'Studio B', occupied_days: 7, available_days: 31, gross_revenue: 220000 },
  ],
}

test.group('renderPerformanceReport', () => {
  test('affiche le RevPAR calculé sur les jours disponibles', ({ assert }) => {
    const html = renderPerformanceReport(data, context)

    // 620000 / 31 = 20000
    assert.match(html, /20\s?000/)
  })

  test('affiche les jours occupés sur les jours disponibles', ({ assert }) => {
    const html = renderPerformanceReport(data, context)

    assert.include(html, '22')
    assert.include(html, '31')
  })

  test('classe les biens par occupation décroissante', ({ assert }) => {
    const html = renderPerformanceReport(data, context)

    assert.isBelow(html.indexOf('Studio A'), html.indexOf('Studio B'))
  })

  test('trace un histogramme de l’occupation mensuelle', ({ assert }) => {
    const html = renderPerformanceReport(data, context)

    assert.include(html, '<svg')
  })

  test('masque le tableau par bien quand il n’y en a qu’un', ({ assert }) => {
    const html = renderPerformanceReport({ ...data, properties: [data.properties[0]] }, context)

    assert.notInclude(html, 'Répartition par bien')
  })

  test('porte la note sur la mesure en jours écoulés', ({ assert }) => {
    const html = renderPerformanceReport(data, context)

    assert.include(html, 'jours écoulés')
  })

  test('arrondit le séjour moyen au dixième', ({ assert }) => {
    // `average_stay` est un quotient brut aligné sur `moyen_sejour` de Finance :
    // imprimé tel quel, « 4.333333333333333 j » sortirait sur le document.
    const html = renderPerformanceReport({ ...data, average_stay: 13 / 3 }, context)

    assert.include(html, '4,3 j')
    assert.notInclude(html, '4.333')
  })

  test('ne divise pas par zéro sur un parc sans jour disponible', ({ assert }) => {
    const html = renderPerformanceReport(
      { ...data, occupied_days: 0, available_days: 0, gross_revenue: 0, properties: [] },
      context
    )

    assert.notInclude(html, 'Infinity')
    assert.notInclude(html, 'NaN')
  })
})
