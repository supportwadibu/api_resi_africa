import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { defineConfig, syncDestination, targets } from '@adonisjs/core/logger'

const loggerConfig = defineConfig({
  /**
   * Default logger name used by ctx.logger and app logger calls.
   */
  default: 'app',

  loggers: {
    app: {
      /**
       * Toggle this logger on/off.
       */
      enabled: true,

      /**
       * Logger name shown in log records.
       */
      name: env.get('APP_NAME'),

      /**
       * Minimum level to output (trace, debug, info, warn, error, fatal).
       */
      level: env.get('LOG_LEVEL'),

      /**
       * Use sync destination in non-production for immediate flush.
       */
      destination: !app.inProduction ? await syncDestination() : undefined,

      /**
       * Secrets masqués où qu'ils apparaissent dans un objet journalisé : un
       * `logger.error({ err, payload })` écrit à la hâte ne doit pas recopier
       * un mot de passe ou un jeton dans des journaux lus par l'hébergeur.
       * Chemins à un niveau de profondeur — pino ne sait pas masquer à toute
       * profondeur sans coût par ligne.
       */
      redact: {
        paths: [
          'password',
          '*.password',
          'password_confirmation',
          '*.password_confirmation',
          'current_password',
          '*.current_password',
          'new_password',
          '*.new_password',
          'refresh_token',
          '*.refresh_token',
          'access_token',
          '*.access_token',
          'id_token',
          '*.id_token',
          'secret',
          '*.secret',
          'headers.authorization',
          '*.headers.authorization',
          'headers["x-cron-secret"]',
          '*.headers["x-cron-secret"]',
        ],
        censor: '[masqué]',
      },

      /**
       * Configure where logs are written.
       */
      transport: {
        targets: [targets.file({ destination: 1 })],
      },
    },
  },
})

export default loggerConfig

/**
 * Inferring types for the list of loggers you have configured
 * in your application.
 */
declare module '@adonisjs/core/types' {
  export interface LoggersList extends InferLoggers<typeof loggerConfig> {}
}
