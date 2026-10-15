import cronConfig from '#config/cron'

import type { CronScheduler } from './cron_scheduler.ts'

/**
 * Enregistre les tâches cron standard de l'application dans l'ordonnanceur.
 *
 * Les use cases sont importés paresseusement lors de l'exécution pour ne
 * pas alourdir le temps de boot initial et éviter toute dépendance circulaire.
 */
export function registerCronTasks(scheduler: CronScheduler): void {
  // 1. Clôture des séjours passés et bascule en cours
  scheduler.register({
    name: 'stay-statuses',
    cronExpression: cronConfig.schedules.stayStatuses,
    handler: async () => {
      const { SyncStayStatusesUseCase } =
        await import('#features/bookings/use_cases/sync_stay_statuses.use_case')
      return new SyncStayStatusesUseCase().execute()
    },
  })

  // 2. Relances d'abonnement (J-7, J-3, J-0)
  scheduler.register({
    name: 'subscription-reminders',
    cronExpression: cronConfig.schedules.subscriptionReminders,
    handler: async () => {
      const { SendSubscriptionRemindersUseCase } =
        await import('#features/notifications/use_cases/send_subscription_reminders.use_case')
      return new SendSubscriptionRemindersUseCase().execute()
    },
  })

  // 3. Expiration des essais échus et suspension des propriétaires non validés
  scheduler.register({
    name: 'expire-trials',
    cronExpression: cronConfig.schedules.expireTrials,
    handler: async () => {
      const { SuspendUnverifiedOwnersUseCase } =
        await import('#features/subscriptions/use_cases/suspend_unverified_owners.use_case')
      return new SuspendUnverifiedOwnersUseCase().execute()
    },
  })

  // 4. Purge des sessions d'authentification expirées
  scheduler.register({
    name: 'purge-sessions',
    cronExpression: cronConfig.schedules.purgeSessions,
    handler: async () => {
      const { PurgeExpiredSessionsUseCase } =
        await import('#features/users/use_cases/purge_expired_sessions.use_case')
      return new PurgeExpiredSessionsUseCase().execute()
    },
  })
}
