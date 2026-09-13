import Property from '#models/property'
import Residence from '#models/residence'
import { DomainError } from '#utils/domain_error'

import type { PropertyDto } from '../dto/property.dto.ts'
import PropertyRepository from '../repositories/property_repository.ts'

import { resolveUnitAddress } from './create_property.use_case.ts'

/**
 * Rattache une unité à une résidence, ou l'en détache.
 *
 * Route dédiée plutôt qu'un champ du PATCH générique : le rattachement n'est pas
 * une simple écriture de `residence_id`. Il déplace un compteur sur deux
 * résidences et peut recopier l'adresse — trois effets qu'un PATCH partiel
 * rendrait invisibles.
 *
 * Le déplacement d'une unité **ne réécrit pas les réservations déjà prises** :
 * leur `residence_id` est figé à la création. Le chiffre d'affaires déjà
 * constaté reste donc imputé à la résidence où le séjour a eu lieu.
 */
export class AttachPropertyToResidenceUseCase {
  constructor(private repo: PropertyRepository = new PropertyRepository()) {}

  async execute(
    id: string,
    ownerId: string,
    input: { residence_id: string | null; unit_label?: string | null; copy_address?: boolean }
  ): Promise<PropertyDto> {
    const property = await Property.findByIdAndOwner(id, ownerId)
    if (!property) {
      throw new DomainError('property_not_found', 'Bien introuvable.', 404)
    }

    const previousId = property.residence_id ?? null
    const nextId = input.residence_id

    const target = nextId ? await Residence.findByIdAndOwner(nextId, ownerId) : null
    if (nextId && !target) {
      throw new DomainError('residence_not_found', 'Résidence introuvable.', 404)
    }

    const patch: Record<string, unknown> = {
      residence_id: nextId,
      unit_label: input.unit_label?.trim() || null,
    }

    // L'adresse n'est recopiée que sur demande : un bien déjà publié porte une
    // adresse que ses annonces affichent, et l'écraser en silence changerait ce
    // que le client a vu.
    if (target && input.copy_address) {
      const address = resolveUnitAddress(undefined, target)
      if (address) patch.address = address
    }

    const updated = await this.repo.update(id, patch, ownerId)
    if (!updated) {
      throw new DomainError('property_not_found', 'Bien introuvable.', 404)
    }

    // Les compteurs ne bougent que si le rattachement a changé : réappliquer le
    // même `residence_id` ne doit pas gonfler le total.
    if (previousId !== nextId) {
      if (previousId) await Residence.adjustUnitsCount(previousId, -1)
      if (nextId) await Residence.adjustUnitsCount(nextId, 1)
    }

    return updated
  }
}

export default AttachPropertyToResidenceUseCase
