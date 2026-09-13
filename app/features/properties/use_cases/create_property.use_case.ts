import Residence from '#models/residence'
import { DomainError } from '#utils/domain_error'

import type { AddressInput, CreatePropertyInput, PropertyDto } from '../dto/property.dto.ts'
import PropertyRepository from '../repositories/property_repository.ts'

/**
 * Adresse d'une unité rattachée à une résidence.
 *
 * Copiée depuis la résidence plutôt que résolue à la lecture : Firestore n'a
 * pas de jointure, et une adresse portée seulement par le lieu imposerait une
 * lecture de plus à chaque affichage d'annonce.
 *
 * C'est donc un instantané figé, comme `client_snapshot` et `daily_price` :
 * corriger l'adresse de la résidence ne réécrit pas les unités déjà créées.
 *
 * Une adresse fournie explicitement par le propriétaire prime — deux bâtiments
 * d'une même résidence peuvent être sur deux rues.
 */
export function resolveUnitAddress(
  provided: AddressInput | undefined,
  residence: {
    address: {
      street: string
      city: string
      country: string
      postal_code: string | null
      coordinates: { latitude: number | null; longitude: number | null }
    }
  } | null
): AddressInput | undefined {
  if (provided) return provided
  if (!residence) return undefined

  return {
    street: residence.address.street,
    city: residence.address.city,
    country: residence.address.country,
    postal_code: residence.address.postal_code ?? undefined,
    coordinates: {
      latitude: residence.address.coordinates.latitude ?? undefined,
      longitude: residence.address.coordinates.longitude ?? undefined,
    },
  }
}

export class CreatePropertyUseCase {
  constructor(private repo: PropertyRepository = new PropertyRepository()) {}

  async execute(input: CreatePropertyInput): Promise<PropertyDto> {
    if (input.pricing.daily_price <= 0) {
      throw new DomainError('invalid_daily_price', 'Le tarif par jour doit être positif.', 422)
    }
    // La surface est facultative : seule une valeur renseignée est contrôlée.
    if (input.details.surface_area !== undefined && input.details.surface_area <= 0) {
      throw new DomainError('invalid_surface', 'La surface doit être positive.', 422)
    }

    const residence = input.residence_id
      ? await Residence.findByIdAndOwner(input.residence_id, input.owner_id)
      : null

    if (input.residence_id && !residence) {
      throw new DomainError('residence_not_found', 'Résidence introuvable.', 404)
    }

    const address = resolveUnitAddress(input.address, residence)
    if (!address) {
      throw new DomainError(
        'address_required',
        'L’adresse est obligatoire pour un bien sans résidence.',
        422
      )
    }

    const property = await this.repo.create({ ...input, address })

    // Le compteur est ajusté après l'écriture de l'unité : l'incrémenter avant
    // laisserait une résidence créditée d'une unité que la création aurait pu
    // ne pas produire.
    if (residence) {
      await Residence.adjustUnitsCount(residence._id, 1)
    }

    return property
  }
}

export default CreatePropertyUseCase
