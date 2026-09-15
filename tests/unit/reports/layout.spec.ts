import { test } from '@japa/runner'
import { escapeHtml, formatAmount, formatPercent, renderDocument } from '#features/reports/renderers/layout'

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

  test('répète la période en pied de page', ({ assert }) => {
    const html = renderDocument({ title: 'Bilan financier', context, sections: [] })

    assert.include(html, '@page')
    assert.include(html, 'position: running(footer)')
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
