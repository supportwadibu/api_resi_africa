import { test } from '@japa/runner'

import {
  buildReminderMessage,
  reminderDispatchId,
  reminderStage,
  reminderWindow,
} from '#features/notifications/subscription_reminder'

const d = (iso: string) => new Date(iso)
const now = d('2026-09-30T08:00:00Z')

test.group('reminderStage', () => {
  test('sept jours avant l’échéance : relance J-7', ({ assert }) => {
    assert.equal(reminderStage(d('2026-10-07T23:00:00Z'), now), 7)
  })

  test('trois jours avant : relance J-3', ({ assert }) => {
    assert.equal(reminderStage(d('2026-10-03T00:00:00Z'), now), 3)
  })

  test('le jour même, heure passée ou non : relance J', ({ assert }) => {
    assert.equal(reminderStage(d('2026-09-30T23:59:00Z'), now), 0)
    assert.equal(reminderStage(d('2026-09-30T06:00:00Z'), now), 0)
  })

  test('un passage manqué rattrape l’étape en cours', ({ assert }) => {
    // Le cron n'a pas tourné à J-7 : à J-5, c'est la relance J-7 qui part,
    // jamais silence jusqu'à J-3.
    assert.equal(reminderStage(d('2026-10-05T12:00:00Z'), now), 7)
    assert.equal(reminderStage(d('2026-10-01T12:00:00Z'), now), 3)
  })

  test('trop loin ou déjà échu : aucune relance', ({ assert }) => {
    assert.isNull(reminderStage(d('2026-10-08T12:00:00Z'), now))
    assert.isNull(reminderStage(d('2026-09-29T23:00:00Z'), now))
  })
})

test.group('reminderWindow', () => {
  test('du début du jour à la fin du huitième jour', ({ assert }) => {
    const window = reminderWindow(now)
    assert.equal(window.from.toISOString(), '2026-09-30T00:00:00.000Z')
    assert.equal(window.to.toISOString(), '2026-10-08T00:00:00.000Z')
  })
})

test.group('reminderDispatchId', () => {
  test('un abonnement prolongé est relancé à nouveau', ({ assert }) => {
    // La clé porte l'échéance : prolonger l'abonnement change la clé, et la
    // nouvelle échéance aura ses propres relances.
    const before = reminderDispatchId('sub-1', 7, d('2026-10-07T12:00:00Z'))
    const after = reminderDispatchId('sub-1', 7, d('2026-11-07T12:00:00Z'))
    assert.notEqual(before, after)
    assert.equal(before, 'sub-1:j7:2026-10-07')
  })
})

test.group('buildReminderMessage', () => {
  test('abonnement à J-7', ({ assert }) => {
    const message = buildReminderMessage(
      { id: 'sub-1', is_trial: false, end_date: d('2026-10-07T12:00:00Z') },
      now
    )
    assert.equal(message.title, 'Votre abonnement expire dans 7 jours')
    assert.include(message.body, '07/10/2026')
    assert.deepEqual(message.data, {
      type: 'subscription_expiry',
      subscription_id: 'sub-1',
      days_left: '7',
    })
  })

  test('essai gratuit le jour même', ({ assert }) => {
    const message = buildReminderMessage(
      { id: 'sub-2', is_trial: true, end_date: d('2026-09-30T20:00:00Z') },
      now
    )
    assert.equal(message.title, 'Votre essai gratuit se termine aujourd’hui')
    assert.equal(message.data?.days_left, '0')
  })

  test('la veille s’écrit « demain »', ({ assert }) => {
    const message = buildReminderMessage(
      { id: 'sub-3', is_trial: false, end_date: d('2026-10-01T10:00:00Z') },
      now
    )
    assert.equal(message.title, 'Votre abonnement expire demain')
  })
})
