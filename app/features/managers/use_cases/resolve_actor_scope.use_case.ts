import { DomainError } from '#utils/domain_error'

import type { ActorScope } from '#features/managers/scope'
import type { ManagerAssignmentRecord } from '#models/manager_assignment'

type AssignmentLoader = (managerId: string) => Promise<ManagerAssignmentRecord | null>

/**
 * Résout le périmètre d'un appelant authentifié.
 *
 * Le chargeur d'affectation est passé en argument plutôt qu'importé : le use
 * case reste ainsi vérifiable sans contacter Firebase, conformément à la règle
 * des tests unitaires du projet.
 */
export async function resolveActorScope(
  user: { id: string; role: string },
  loadAssignment: AssignmentLoader
): Promise<ActorScope> {
  if (user.role !== 'gerant') {
    // Propriétaire, admin, client : le chemin existant, sans restriction ni
    // lecture supplémentaire.
    return { ownerId: user.id, actorId: user.id, propertyIds: null }
  }

  const assignment = await loadAssignment(user.id)

  if (!assignment || !assignment.is_active) {
    throw new DomainError(
      'manager_not_assigned',
      "Votre compte gérant n'est rattaché à aucun propriétaire actif.",
      403
    )
  }

  return {
    ownerId: assignment.owner_id,
    actorId: user.id,
    propertyIds: assignment.property_ids,
  }
}

export default resolveActorScope
