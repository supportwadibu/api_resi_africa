import type { HttpContext } from '@adonisjs/core/http'

/**
 * Sonde de disponibilité, publique.
 *
 * Appelée par un moniteur externe (cron-job.org, UptimeRobot) pour vérifier
 * que le serveur répond et maintenir éveillée une instance Render gratuite,
 * qui s'endort après quinze minutes d'inactivité.
 *
 * Sans secret, à dessein : elle ne lit ni n'écrit rien et ne révèle que
 * l'heure du serveur. Rangée auparavant sous `/cron`, elle héritait du secret
 * des tâches planifiées — qui, elles, déclenchent des écritures en masse et le
 * gardent — et un moniteur mal configuré la voyait en 401 alors que le serveur
 * tournait.
 *
 * Aucune lecture Firestore non plus : la sonde dit que le processus répond,
 * pas que chaque dépendance est saine, et la faire échouer sur un incident
 * Firebase ferait redémarrer un serveur qui n'y peut rien.
 */
export default class HealthController {
  /** GET|HEAD /health et /api/v1/health */
  async show(ctx: HttpContext) {
    // `no-store` : un proxy qui servirait une réponse en cache masquerait un
    // serveur tombé.
    ctx.response.header('Cache-Control', 'no-store')

    return ctx.response.ok({
      status: 'ok',
      time: new Date().toISOString(),
      uptime_s: Math.round(process.uptime()),
    })
  }
}
