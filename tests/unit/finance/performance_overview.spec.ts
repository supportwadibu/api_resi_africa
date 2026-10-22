import { test } from '@japa/runner'

import { toPerformanceOverview } from '#features/finance/performance_overview'

const overview = {
  summary: {
    ca_brut: 120000,
    depenses: 35000,
    benefice_net: 85000,
    commissions: 5000,
    remboursements: 0,
    taux_occupation: 0.42,
    reservations: 4,
    moyen_sejour: 3.5,
  },
  revenue_points: [{ month: 'Oct', value: 120000 }],
}

test.group('toPerformanceOverview', () => {
  test('garde le suivi des revenus et de l’occupation', ({ assert }) => {
    assert.deepEqual(toPerformanceOverview(overview), {
      summary: { ca_brut: 120000, taux_occupation: 0.42, reservations: 4, moyen_sejour: 3.5 },
      revenue_points: [{ month: 'Oct', value: 120000 }],
    })
  })

  test('ne laisse passer ni charges ni bénéfice', ({ assert }) => {
    // RESI Basic suit ses revenus ; dépenses, commissions et rentabilité
    // relèvent de RESI Pro.
    const summary = toPerformanceOverview(overview).summary as Record<string, unknown>

    assert.notProperty(summary, 'depenses')
    assert.notProperty(summary, 'benefice_net')
    assert.notProperty(summary, 'commissions')
    assert.notProperty(summary, 'remboursements')
  })
})
