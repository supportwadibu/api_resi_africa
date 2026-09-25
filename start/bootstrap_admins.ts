/*
|--------------------------------------------------------------------------
| Administrateurs garantis au démarrage
|--------------------------------------------------------------------------
|
| Firestore n'a pas de migrations : les comptes listés dans `BOOTSTRAP_ADMINS`
| sont créés au démarrage du serveur HTTP, donc à chaque déploiement, sans
| étape manuelle. Rejouer ne crée rien de plus.
|
| Préchargé pour l'environnement `web` seulement (voir `adonisrc.ts`) : ni les
| commandes ace ni les tests ne déclenchent d'écriture.
|
| Lancé sans attendre : une erreur Firestore passagère ne doit pas empêcher
| l'API de démarrer — elle est journalisée, et le démarrage suivant réessaie.
|
| Limite : deux instances démarrant ensemble pourraient créer le même compte
| en double, le contrôle d'unicité de `User.create` n'étant pas atomique. Sans
| objet tant que le service tourne sur une instance unique.
|
*/

import env from '#start/env'
import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'

app.ready(() => {
  const raw = env.get('BOOTSTRAP_ADMINS')?.release()
  if (!raw) return

  void ensureAdmins(raw).catch((error) => {
    logger.error({ err: error }, 'Création des administrateurs au démarrage : échec')
  })
})

async function ensureAdmins(raw: string) {
  const { parseAdminSeeds } = await import('#features/users/admin_seeds')
  const { EnsureAdminsUseCase } = await import('#features/users/use_cases/ensure_admins.use_case')

  const { admins, errors } = await parseAdminSeeds(raw)
  for (const message of errors) logger.warn(message)

  const report = await new EnsureAdminsUseCase().execute(admins)

  if (report.created.length > 0) {
    logger.info({ emails: report.created }, 'Administrateurs créés')
  }
  if (report.existing.length > 0) {
    logger.info({ emails: report.existing }, 'Administrateurs déjà présents, laissés tels quels')
  }
  for (const conflict of report.conflicts) {
    logger.warn(`Administrateur ${conflict.email} non créé : ${conflict.reason}`)
  }
}
