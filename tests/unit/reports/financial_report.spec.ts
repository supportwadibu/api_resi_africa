import { test } from '@japa/runner'
import { renderFinancialReport } from '#features/reports/renderers/financial_report'

const context = {
  owner_name: 'Kouassi',
  residence_name: null,
  period: {
    window: { from: new Date('2026-03-01T00:00:00Z'), to: new Date('2026-04-01T00:00:00Z') },
    label: 'Mars 2026',
    from_date: '2026-03-01',
    to_date: '2026-03-31',
  },
  generated_at: new Date('2026-04-02T09:30:00Z'),
}

const data = {
  overview: {
    summary: {
      ca_brut: 1250000,
      depenses: 300000,
      benefice_net: 950000,
      taux_occupation: 0.73,
      reservations: 12,
      moyen_sejour: 4.5,
    },
    revenue_points: [
      { month: 'Jan', value: 400000 },
      { month: 'Fév', value: 850000 },
    ],
  },
  expenses_by_category: [
    { category: 'electricity', amount: 180000 },
    { category: 'cleaning', amount: 120000 },
  ],
}

test.group('renderFinancialReport', () => {
  test('affiche les six chiffres clés', ({ assert }) => {
    const html = renderFinancialReport(data, context)

    assert.match(html, /1\s?250\s?000/)
    assert.match(html, /950\s?000/)
    assert.include(html, '73 %')
    assert.include(html, '12')
  })

  test('traduit les catégories de dépense en français', ({ assert }) => {
    const html = renderFinancialReport(data, context)

    assert.include(html, 'Électricité')
    assert.include(html, 'Ménage')
    assert.notInclude(html, 'electricity')
  })

  test('calcule la part de chaque catégorie', ({ assert }) => {
    const html = renderFinancialReport(data, context)

    assert.include(html, '60 %')
  })

  test('arrondit le séjour moyen au dixième', ({ assert }) => {
    // `moyen_sejour` arrive en quotient brut de `FinanceSummaryDto` :
    // « 4.333333333333333 j » sur un document destiné à une banque.
    const html = renderFinancialReport(
      {
        ...data,
        overview: { ...data.overview, summary: { ...data.overview.summary, moyen_sejour: 13 / 3 } },
      },
      context
    )

    assert.include(html, '4,3 j')
    assert.notInclude(html, '4.333')
  })

  test('trace une courbe des revenus', ({ assert }) => {
    const html = renderFinancialReport(data, context)

    assert.include(html, '<svg')
    assert.include(html, 'Fév')
  })

  test('porte la note sur la non-répartition des charges communes', ({ assert }) => {
    const html = renderFinancialReport(data, context)

    assert.include(html, 'charges communes')
  })

  test('reste valide sur une période sans activité', ({ assert }) => {
    const html = renderFinancialReport(
      {
        overview: {
          summary: {
            ca_brut: 0,
            depenses: 0,
            benefice_net: 0,
            taux_occupation: 0,
            reservations: 0,
            moyen_sejour: 0,
          },
          revenue_points: [],
        },
        expenses_by_category: [],
      },
      context
    )

    assert.include(html, 'Aucun mouvement sur la période')
  })

  test('affiche un bénéfice négatif sans le masquer', ({ assert }) => {
    const html = renderFinancialReport(
      {
        overview: {
          summary: {
            ca_brut: 100000,
            depenses: 250000,
            benefice_net: -150000,
            taux_occupation: 0.2,
            reservations: 2,
            moyen_sejour: 3,
          },
          revenue_points: [],
        },
        expenses_by_category: [],
      },
      context
    )

    assert.match(html, /-\s?150\s?000/)
  })
})
