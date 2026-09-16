import { test } from '@japa/runner'
import { occupancyRatio } from '#features/reports/metrics/occupancy'

test.group('occupancyRatio', () => {
  test('rapporte les jours-bien occupés à la capacité du parc, pas aux seuls jours calendaires', ({
    assert,
  }) => {
    // 5 biens sur 30 jours = 150 jours-bien disponibles. 60 jours-bien
    // occupés, c'est 40 % du parc — le bug corrigé ici rapportait ce même
    // numérateur aux 30 jours calendaires seuls et affichait 200 %.
    assert.equal(occupancyRatio(60, 150), 0.4)
  })

  test('un parc mono-bien reste correct (le bug y était invisible)', ({ assert }) => {
    assert.equal(occupancyRatio(12, 30), 0.4)
  })

  test('plafonne à 1 quand des séjours débordent la fenêtre', ({ assert }) => {
    assert.equal(occupancyRatio(180, 150), 1)
  })

  test('rend 0 sur une capacité nulle plutôt qu’un NaN ou un Infinity', ({ assert }) => {
    assert.equal(occupancyRatio(0, 0), 0)
    assert.equal(occupancyRatio(10, 0), 0)
  })

  test('rend 0 quand rien n’est occupé', ({ assert }) => {
    assert.equal(occupancyRatio(0, 150), 0)
  })
})
