import { BaseCommand, flags } from '@adonisjs/core/ace'

import type { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * Crée un compte administrateur à la main.
 *
 * Au déploiement, les admins listés dans `BOOTSTRAP_ADMINS` sont créés seuls
 * (voir `start/bootstrap_admins.ts`) ; cette commande sert au cas ponctuel :
 *
 *   node ace admin:create --name="Awa Koné" --email=awa@exemple.ci
 *   node ace admin:create        # sans option : tout est demandé
 *
 * Identité en options ou saisie, mot de passe toujours saisi masqué : passé en
 * option, il resterait dans l'historique du shell. Même use case que le démarrage,
 * donc mêmes règles : un compte déjà admin est laissé tel quel, un compte d'un
 * autre rôle n'est jamais promu.
 */
export default class CreateAdmin extends BaseCommand {
  static commandName = 'admin:create'
  static description = 'Crée un compte administrateur (mot de passe saisi de façon masquée)'

  static options: CommandOptions = {
    startApp: true,
  }

  @flags.string({ description: 'Nom complet (demandé s’il est absent)' })
  declare name?: string

  @flags.string({ description: 'E-mail de connexion au back-office (demandé s’il est absent)' })
  declare email?: string

  @flags.string({ description: 'Téléphone, au format +2250700000000 (facultatif)' })
  declare phone?: string

  async run() {
    // Imports différés : les modèles touchent Firestore, que le provider
    // n'initialise qu'au démarrage de l'application.
    const { default: UserRepository } = await import('#features/users/repositories/user_repository')
    const { parseAdminSeeds } = await import('#features/users/admin_seeds')
    const { EnsureAdminsUseCase } = await import('#features/users/use_cases/ensure_admins.use_case')

    // Le téléphone n'est proposé qu'en mode entièrement interactif : passer
    // `--name` et `--email` sans `--phone` signifie « pas de téléphone ».
    const interactive = !this.name || !this.email
    const required = (value: string) => value.trim() !== '' || 'Champ obligatoire.'
    const name: string =
      this.name ?? (await this.prompt.ask<string>('Nom complet', { validate: required }))
    const rawEmail: string =
      this.email ?? (await this.prompt.ask<string>('E-mail', { validate: required }))
    let phone = this.phone
    if (phone === undefined && interactive) {
      const answer = await this.prompt.ask<string>('Téléphone (facultatif, Entrée pour passer)')
      phone = answer.trim() || undefined
    }

    // Contrôle avant la saisie : inutile de demander un mot de passe pour un
    // compte qui ne sera pas créé.
    const email = rawEmail.trim().toLowerCase()
    const repo = new UserRepository()
    if (await repo.findByEmail(email)) {
      this.logger.info(`Un compte existe déjà pour ${email} : rien n’est modifié.`)
      return
    }

    const password = await this.prompt.secure('Mot de passe (8 à 64 caractères)')
    const confirmation = await this.prompt.secure('Confirmation du mot de passe')
    if (password !== confirmation) {
      this.logger.error('Les deux saisies diffèrent. Aucun compte créé.')
      this.exitCode = 1
      return
    }

    // Même lecture que `BOOTSTRAP_ADMINS`, pour une validation identique.
    const { admins, errors } = await parseAdminSeeds(
      JSON.stringify([{ full_name: name, email: rawEmail, phone, password }])
    )
    if (errors.length > 0) {
      for (const message of errors)
        this.logger.error(message.replace(/^BOOTSTRAP_ADMINS\[0\]\./, ''))
      this.exitCode = 1
      return
    }

    const report = await new EnsureAdminsUseCase(repo).execute(admins)
    for (const created of report.created) this.logger.success(`Administrateur créé : ${created}`)
    for (const conflict of report.conflicts) {
      this.logger.error(`${conflict.email} : ${conflict.reason}`)
      this.exitCode = 1
    }
  }
}
