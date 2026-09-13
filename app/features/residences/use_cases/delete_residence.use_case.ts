import Property from '#models/property'
import Residence from '#models/residence'
import { DomainError } from '#utils/domain_error'

/**
 * Supprime une résidence, à condition qu'elle ne porte plus d'unité.
 *
 * Les unités ne sont pas supprimées en cascade : elles portent des
 * réservations, des revenus et un historique. Les effacer avec le lieu
 * détruirait la comptabilité du propriétaire sur un simple geste de rangement.
 *
 * Le comptage est fait sur `properties` et non sur `units_count` : le compteur
 * est dénormalisé, donc faillible, et s'y fier laisserait supprimer une
 * résidence encore occupée dès qu'il aurait dérivé.
 */
export class DeleteResidenceUseCase {
  async execute(id: string, ownerId: string): Promise<void> {
    const residence = await Residence.findByIdAndOwner(id, ownerId)
    if (!residence) {
      throw new DomainError('residence_not_found', 'Résidence introuvable.', 404)
    }

    const units = await Property.countByResidence(id)
    if (units > 0) {
      throw new DomainError(
        'residence_has_units',
        `Cette résidence compte encore ${units} logement(s). Détachez-les avant de la supprimer.`,
        409
      )
    }

    const deleted = await Residence.deleteOne(id, ownerId)
    if (!deleted) {
      throw new DomainError('residence_not_found', 'Résidence introuvable.', 404)
    }
  }
}

export default DeleteResidenceUseCase
