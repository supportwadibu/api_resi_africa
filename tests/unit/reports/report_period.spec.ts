import { test } from '@japa/runner'
import { resolveReportPeriod } from '#features/reports/report_period'
import { DomainError } from '#utils/domain_error'

test.group('resolveReportPeriod', () => {
  test('this_month couvre le mois courant, fin exclue', ({ assert }) => {
    const resolved = resolveReportPeriod({ period: 'this_month' }, new Date('2026-03-17T10:00:00Z'))

    assert.equal(resolved.window.from.toISOString(), '2026-03-01T00:00:00.000Z')
    assert.equal(resolved.window.to.toISOString(), '2026-04-01T00:00:00.000Z')
    assert.equal(resolved.from_date, '2026-03-01')
    assert.equal(resolved.to_date, '2026-03-31')
    assert.equal(resolved.label, 'Mars 2026')
  })

  test('last_month en janvier recule sur décembre de l’année précédente', ({ assert }) => {
    const resolved = resolveReportPeriod({ period: 'last_month' }, new Date('2026-01-08T10:00:00Z'))

    assert.equal(resolved.window.from.toISOString(), '2025-12-01T00:00:00.000Z')
    assert.equal(resolved.window.to.toISOString(), '2026-01-01T00:00:00.000Z')
    assert.equal(resolved.label, 'Décembre 2025')
  })

  test('this_year couvre l’année civile', ({ assert }) => {
    const resolved = resolveReportPeriod({ period: 'this_year' }, new Date('2026-07-02T10:00:00Z'))

    assert.equal(resolved.window.from.toISOString(), '2026-01-01T00:00:00.000Z')
    assert.equal(resolved.window.to.toISOString(), '2027-01-01T00:00:00.000Z')
    assert.equal(resolved.label, 'Année 2026')
  })

  test('custom rend le dernier jour entier : to est exclu au jour suivant', ({ assert }) => {
    const resolved = resolveReportPeriod({
      period: 'custom',
      from: '2026-03-01',
      to: '2026-03-31',
    })

    assert.equal(resolved.window.to.toISOString(), '2026-04-01T00:00:00.000Z')
    assert.equal(resolved.to_date, '2026-03-31')
  })

  test('custom sans bornes est refusé', ({ assert }) => {
    assert.throws(
      () => resolveReportPeriod({ period: 'custom' }),
      'Indiquez les dates de début et de fin de la période.'
    )
  })

  test('custom avec from postérieur à to est refusé', ({ assert }) => {
    assert.throws(() =>
      resolveReportPeriod({ period: 'custom', from: '2026-04-01', to: '2026-03-01' })
    )
  })

  test('une plage au-delà de 24 mois est refusée', ({ assert }) => {
    try {
      resolveReportPeriod({ period: 'custom', from: '2020-01-01', to: '2026-01-01' })
      assert.fail('aurait dû lever')
    } catch (error) {
      assert.instanceOf(error, DomainError)
      assert.equal((error as DomainError).code, 'report_period_too_large')
    }
  })

  test('une date mal formée est refusée', ({ assert }) => {
    try {
      resolveReportPeriod({ period: 'custom', from: '01/03/2026', to: '2026-03-31' })
      assert.fail('aurait dû lever')
    } catch (error) {
      assert.equal((error as DomainError).code, 'invalid_report_period')
    }
  })
})
