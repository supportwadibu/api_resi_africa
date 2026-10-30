import { isPublicProperty } from '#features/properties/public_property'
import Negotiation from '#models/negotiation'
import Property from '#models/property'
import { DomainError } from '#utils/domain_error'

import type { NegotiationDto } from '../dto/negotiation.dto.ts'

function toDto(
  status: NegotiationDto['status'],
  offers: number[],
  dailyPrice: number
): NegotiationDto {
  return {
    status,
    daily_price: dailyPrice,
    offers: offers.map((price, index) => ({ level: index + 1, daily_price: price })),
  }
}

/**
 * « Négocier » et « Négocier encore » d'un client sur un logement publié.
 *
 * Répond toujours 200 : « non négociable » et « plus de palier » sont des
 * réponses que l'application affiche, pas des erreurs. Le nombre de paliers
 * restants n'est jamais dit — le client ne sait pas s'il touche le plancher.
 */
export class NegotiateUseCase {
  /** Paliers déjà révélés, pour rouvrir la feuille où le client l'a laissée. */
  async current(propertyId: string, clientId: string): Promise<NegotiationDto> {
    const property = await this.publicProperty(propertyId, clientId)
    const offers = await Negotiation.offers(propertyId, clientId, new Date())
    const negotiable = property.negotiation?.enabled === true
    return toDto(
      negotiable ? 'offer' : 'not_negotiable',
      negotiable ? offers : [],
      property.pricing.daily_price
    )
  }

  /** Révèle le palier suivant. */
  async next(propertyId: string, clientId: string): Promise<NegotiationDto> {
    await this.publicProperty(propertyId, clientId)
    const revealed = await Negotiation.revealNext(propertyId, clientId, new Date())
    if (!revealed) throw new DomainError('property_not_found', 'Propriété introuvable.', 404)

    const { result, daily_price: dailyPrice } = revealed
    return toDto(result.status, result.status === 'not_negotiable' ? [] : result.offers, dailyPrice)
  }

  private async publicProperty(propertyId: string, clientId: string) {
    const property = await Property.findById(propertyId)
    if (!property || !isPublicProperty(property)) {
      throw new DomainError('property_not_found', 'Propriété introuvable.', 404)
    }
    if (property.owner_id === clientId) {
      throw new DomainError(
        'invalid_booking_owner',
        'Vous ne pouvez pas négocier votre propre logement.',
        422
      )
    }
    return property
  }
}

export default NegotiateUseCase
