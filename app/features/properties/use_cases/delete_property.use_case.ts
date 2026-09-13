import Property from '#models/property'
import Residence from '#models/residence'
import { DomainError } from '#utils/domain_error'

import PropertyRepository from '../repositories/property_repository.ts'

export class DeletePropertyUseCase {
  constructor(private repo: PropertyRepository = new PropertyRepository()) {}

  async execute(id: string, owner_id?: string): Promise<void> {
    // Le rattachement est lu avant la suppression : après, le document n'existe
    // plus et la résidence resterait créditée d'une unité disparue.
    const property = await Property.findById(id)
    const residenceId = property?.residence_id ?? null

    const deleted = await this.repo.delete(id, owner_id)
    if (!deleted) {
      throw new DomainError('property_not_found', 'Propriété introuvable.', 404)
    }

    if (residenceId) {
      await Residence.adjustUnitsCount(residenceId, -1)
    }
  }
}

export default DeletePropertyUseCase
