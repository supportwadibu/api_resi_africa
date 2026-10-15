import { test } from '@japa/runner'

import { CronScheduler } from '#services/cron/cron_scheduler'
import { registerCronTasks } from '#services/cron/register_tasks'

test.group('CronScheduler — enregistrement et validation', (group) => {
  let scheduler: CronScheduler

  group.each.setup(() => {
    scheduler = new CronScheduler()
  })

  group.each.teardown(() => {
    scheduler.clear()
  })

  test('accepte une expression cron valide', ({ assert }) => {
    scheduler.register({
      name: 'test-valid',
      cronExpression: '*/15 * * * *',
      handler: async () => 'ok',
    })

    const tasks = scheduler.getTasks()
    assert.equal(tasks.length, 1)
    assert.equal(tasks[0].name, 'test-valid')
    assert.equal(tasks[0].cronExpression, '*/15 * * * *')
    assert.isFalse(tasks[0].isScheduled)
  })

  test('rejette une expression cron invalide avec un message explicite', ({ assert }) => {
    assert.throws(
      () =>
        scheduler.register({
          name: 'test-invalid',
          cronExpression: 'expression-invalide',
          handler: async () => 'error',
        }),
      'Expression cron invalide pour la tâche "test-invalid" : "expression-invalide"'
    )
  })

  test('remplace une tâche existante portant le même nom', ({ assert }) => {
    scheduler.register({
      name: 'unique-task',
      cronExpression: '0 8 * * *',
      handler: async () => 'first',
    })

    scheduler.register({
      name: 'unique-task',
      cronExpression: '0 12 * * *',
      handler: async () => 'second',
    })

    const tasks = scheduler.getTasks()
    assert.equal(tasks.length, 1)
    assert.equal(tasks[0].cronExpression, '0 12 * * *')
  })
})

test.group('CronScheduler — exécution des tâches (runTask)', (group) => {
  let scheduler: CronScheduler

  group.each.setup(() => {
    scheduler = new CronScheduler()
  })

  group.each.teardown(() => {
    scheduler.clear()
  })

  test('exécute le handler et renvoie son résultat', async ({ assert }) => {
    let executed = false
    scheduler.register({
      name: 'run-me',
      cronExpression: '0 0 * * *',
      handler: async () => {
        executed = true
        return { count: 42 }
      },
    })

    const result = await scheduler.runTask('run-me')
    assert.isTrue(executed)
    assert.deepEqual(result, { count: 42 })
  })

  test('lève une erreur si la tâche n’existe pas', async ({ assert }) => {
    await assert.rejects(
      async () => scheduler.runTask('inexistante'),
      'Tâche cron introuvable : "inexistante"'
    )
  })

  test('empêche les exécutions concurrentes d’une même tâche (anti-chevauchement)', async ({
    assert,
  }) => {
    let resolveFirst!: () => void
    const firstBlocked = new Promise<void>((r) => {
      resolveFirst = r
    })

    let executions = 0

    scheduler.register({
      name: 'slow-task',
      cronExpression: '* * * * *',
      handler: async () => {
        executions++
        await firstBlocked
        return 'done'
      },
    })

    // Premier appel bloqué
    const firstPromise = scheduler.runTask('slow-task')

    // Second appel pendant que le premier est toujours en cours
    const secondResult = await scheduler.runTask('slow-task')

    // Le second appel doit être ignoré
    assert.isNull(secondResult)
    assert.equal(executions, 1)

    // Libère le premier appel
    resolveFirst()
    await firstPromise
  })

  test('réinitialise isRunning même lorsque le handler lève une erreur', async ({ assert }) => {
    let callCount = 0

    scheduler.register({
      name: 'failing-task',
      cronExpression: '* * * * *',
      handler: async () => {
        callCount++
        if (callCount === 1) {
          throw new Error('Panne temporaire')
        }
        return 'recovered'
      },
    })

    await assert.rejects(async () => scheduler.runTask('failing-task'), 'Panne temporaire')

    // L'exécution suivante doit être autorisée (le verrou isRunning a bien été libéré)
    const secondResult = await scheduler.runTask('failing-task')
    assert.equal(secondResult, 'recovered')
  })
})

test.group('CronScheduler — démarrage et arrêt', (group) => {
  let scheduler: CronScheduler

  group.each.setup(() => {
    scheduler = new CronScheduler()
  })

  group.each.teardown(() => {
    scheduler.clear()
  })

  test('démarre et arrête toutes les tâches planifiées', ({ assert }) => {
    scheduler.register({
      name: 'task-a',
      cronExpression: '*/15 * * * *',
      handler: async () => 'a',
    })
    scheduler.register({
      name: 'task-b',
      cronExpression: '0 8 * * *',
      handler: async () => 'b',
    })

    scheduler.start()
    let tasks = scheduler.getTasks()
    assert.isTrue(tasks.every((t) => t.isScheduled))

    scheduler.stop()
    tasks = scheduler.getTasks()
    assert.isTrue(tasks.every((t) => !t.isScheduled))
  })
})

test.group('registerCronTasks', (group) => {
  let scheduler: CronScheduler

  group.each.setup(() => {
    scheduler = new CronScheduler()
  })

  group.each.teardown(() => {
    scheduler.clear()
  })

  test('enregistre les 4 tâches cron par défaut avec leurs planifications', ({ assert }) => {
    registerCronTasks(scheduler)

    const tasks = scheduler.getTasks()
    assert.equal(tasks.length, 4)

    const names = tasks.map((t) => t.name).sort()
    assert.deepEqual(names, [
      'expire-trials',
      'purge-sessions',
      'stay-statuses',
      'subscription-reminders',
    ])
  })
})
