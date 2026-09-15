import { test } from '@japa/runner'
import {
  escapeHtml,
  formatAmount,
  formatDays,
  formatPercent,
  renderDocument,
  reportFooterText,
} from '#features/reports/renderers/layout'

const context = {
  owner_name: 'Kouassi & Fils',
  residence_name: 'Résidence Les Cocotiers',
  period: {
    window: { from: new Date('2026-03-01T00:00:00Z'), to: new Date('2026-04-01T00:00:00Z') },
    label: 'Mars 2026',
    from_date: '2026-03-01',
    to_date: '2026-03-31',
  },
  generated_at: new Date('2026-04-02T09:30:00Z'),
}

test.group('escapeHtml', () => {
  test('neutralise les chevrons d’un nom de client', ({ assert }) => {
    assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  test('neutralise les esperluettes et les guillemets', ({ assert }) => {
    assert.equal(escapeHtml('Kouassi & "Fils"'), 'Kouassi &amp; &quot;Fils&quot;')
  })
})

test.group('formatAmount', () => {
  test('sépare les milliers et suffixe la devise', ({ assert }) => {
    assert.match(formatAmount(1250000), /1\s?250\s?000\sFCFA/)
  })

  test('affiche un montant négatif', ({ assert }) => {
    assert.include(formatAmount(-50000), '-')
  })
})

test.group('formatDays', () => {
  test('arrondit un quotient brut au dixième', ({ assert }) => {
    // `moyen_sejour` est un quotient non arrondi : « 4.333333333333333 j » sur
    // un document destiné à une banque.
    assert.equal(formatDays(13 / 3), '4,3 j')
  })

  test('n’ajoute pas de décimale à une durée entière', ({ assert }) => {
    assert.equal(formatDays(4), '4 j')
  })

  test('rend 0 j sur une période sans réservation', ({ assert }) => {
    assert.equal(formatDays(0), '0 j')
  })
})

test.group('formatPercent', () => {
  test('rend un ratio en pourcentage entier', ({ assert }) => {
    assert.equal(formatPercent(0.734), '73 %')
  })

  test('rend 0 % sur un ratio nul', ({ assert }) => {
    assert.equal(formatPercent(0), '0 %')
  })
})

test.group('renderDocument', () => {
  test('porte le titre, le propriétaire et la période en page de garde', ({ assert }) => {
    const html = renderDocument({ title: 'Bilan financier', context, sections: [] })

    assert.include(html, 'Bilan financier')
    assert.include(html, 'Kouassi &amp; Fils')
    assert.include(html, 'Résidence Les Cocotiers')
    assert.include(html, 'Mars 2026')
  })

  test('annonce tout le parc quand aucune résidence n’est filtrée', ({ assert }) => {
    const html = renderDocument({
      title: 'Bilan financier',
      context: { ...context, residence_name: null },
      sections: [],
    })

    assert.include(html, 'Toutes mes résidences')
  })

  test('assemble les sections dans l’ordre reçu', ({ assert }) => {
    const html = renderDocument({
      title: 'T',
      context,
      sections: ['<section>Première</section>', '<section>Seconde</section>'],
    })

    assert.isBelow(html.indexOf('Première'), html.indexOf('Seconde'))
  })
})

/**
 * Le pied n'est plus produit par le HTML du document mais par le
 * `footerTemplate` de Puppeteer : ce qui compte est que son contenu — enseigne,
 * résidence, période — soit bien composé, et qu'il ne soit pas dupliqué dans le
 * corps (il s'imprimerait alors une fois de plus, avant la page de garde).
 */
test.group('reportFooterText', () => {
  test('porte l’enseigne, la résidence et la période', ({ assert }) => {
    assert.equal(reportFooterText(context), 'RESI · Résidence Les Cocotiers · Mars 2026')
  })

  test('annonce tout le parc quand aucune résidence n’est filtrée', ({ assert }) => {
    assert.equal(
      reportFooterText({ ...context, residence_name: null }),
      'RESI · Toutes mes résidences · Mars 2026'
    )
  })

  test('n’est pas imprimé dans le corps du document', ({ assert }) => {
    const html = renderDocument({ title: 'Bilan financier', context, sections: [] })

    assert.notInclude(html, reportFooterText(context))
  })
})
