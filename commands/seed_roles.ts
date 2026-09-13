import { BaseCommand } from '@adonisjs/core/ace'

import type { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * Crée les trois rôles applicatifs dans Firestore.
 *
 * Sans eux, toute inscription échoue : `register_init` et `google_login`
 * cherchent le rôle par son nom et lèvent `role_not_found` s'il est absent.
 * Mongo héritait des rôles créés à la main ; la base Firebase partant vide,
 * cette commande est un prérequis au premier démarrage.
 *
 * Idempotente : rejouable sans effet de bord.
 */
export default class SeedRoles extends BaseCommand {
  static commandName = 'seed:roles'
  static description = 'Crée les rôles applicatifs (admin, proprio, client) dans Firestore'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    // Import différé : le modèle touche Firestore, que le provider n'initialise
    // qu'au démarrage de l'application.
    const { default: Role } = await import('#models/role')

    const definitions = [
      {
        name: 'admin' as const,
        description: 'Administrateur de la plateforme',
        permissions: ['*'],
      },
      {
        name: 'proprio' as const,
        description: 'Propriétaire mettant des biens en location',
        permissions: ['properties:manage', 'bookings:read', 'bookings:manage'],
      },
      {
        name: 'client' as const,
        description: 'Client réservant un bien',
        permissions: ['properties:read', 'bookings:create', 'bookings:read'],
      },
    ]

    for (const definition of definitions) {
      await Role.upsert(definition)
      this.logger.success(`Rôle « ${definition.name} » créé ou mis à jour`)
    }

    this.logger.info(`${definitions.length} rôles synchronisés.`)
  }
}
