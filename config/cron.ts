import env from '#start/env'

const cronConfig = {
  /**
   * Active ou désactive l'ordonnanceur node-cron interne.
   * Activé par défaut en mode web ; désactivable via `ENABLE_CRON_JOBS=false`.
   */
  enabled: env.get('ENABLE_CRON_JOBS', true),

  /**
   * Fuseau horaire de référence pour les expressions cron.
   * Par défaut `Africa/Abidjan` (UTC+0), heure locale de référence pour le produit.
   */
  timezone: env.get('CRON_TIMEZONE', 'Africa/Abidjan'),

  /**
   * Fréquences de déclenchement des différentes tâches cron.
   */
  schedules: {
    /**
     * Synchronisation des statuts de séjours (arrivée et clôture automatique).
     * Tous les jours à 00:00.
     */
    stayStatuses: env.get('CRON_STAY_STATUSES_SCHEDULE', '0 0 * * *'),

    /**
     * Envoi des relances de fin d'abonnement (J-7, J-3, J-0).
     * Tous les jours à 02:00.
     */
    subscriptionReminders: env.get('CRON_SUBSCRIPTION_REMINDERS_SCHEDULE', '0 2 * * *'),

    /**
     * Expiration des essais gratuits et suspension des propriétaires non validés.
     * Tous les jours à 03:00.
     */
    expireTrials: env.get('CRON_EXPIRE_TRIALS_SCHEDULE', '0 3 * * *'),

    /**
     * Purge des sessions d'authentification expirées dans Firestore.
     * Tous les jours à 02:00.
     */
    purgeSessions: env.get('CRON_PURGE_SESSIONS_SCHEDULE', '0 2 * * *'),
  },
}

export default cronConfig
