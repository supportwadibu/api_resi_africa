import { DomainError } from '#utils/domain_error'

import { findExtensionConflict, toPeriods } from '../availability.ts'
import type { BookingDto, UpdateBookingInput } from '../dto/booking.dto.ts'
import BookingRepository from '../repositories/booking_repository.ts'
import PromoCodeRepository from '../repositories/promo_code_repository.ts'
import { assertExtensionBounds, calculateStayPrice } from '../stay_pricing.ts'

export class UpdateBookingUseCase {
  constructor(
    private repo: BookingRepository = new BookingRepository(),
    private promoRepo: PromoCodeRepository = new PromoCodeRepository()
  ) {}

  async execute(id: string, client_id: string, input: UpdateBookingInput): Promise<BookingDto> {
    const current = await this.repo.findById(id)
    // `in_progress` est prolongeable : c'est précisément le séjour commencé
    // que le client demande à rallonger. Le restreindre à `confirmed`
    // refusait toute prolongation passé l'heure d'arrivée.
    if (
      !current ||
      current.client_id !== client_id ||
      (current.status !== 'confirmed' && current.status !== 'in_progress')
    ) {
      throw new DomainError('booking_not_found', 'Réservation introuvable.', 404)
    }

    const property = await this.repo.getPropertyForPricing(current.property_id)
    if (!property) {
      throw new DomainError('property_not_found', 'Propriété introuvable.', 404)
    }

    assertExtensionBounds(property.pricing, current.start_date, current.end_date, input.end_date)

    const price = calculateStayPrice(property.pricing, current.start_date, input.end_date)
    const promo = input.promo_code
      ? await this.validatePromoCode(input.promo_code, client_id, price.subtotal)
      : null

    // Le chevauchement est vérifié *dans* la transaction d'écriture, comme à
    // la création comptoir : hors transaction, une prolongation et une
    // réservation concurrente sur le segment gagné passaient toutes les deux.
    let booking
    try {
      booking = await this.repo.extendBooking(
        id,
        {
          ...input,
          days_count: price.days,
          daily_price: price.dailyPrice,
          duration_discount_percent: price.discountPercent,
          subtotal_amount: price.subtotal,
          discount_amount: promo?.discount ?? 0,
          total_amount: price.subtotal - (promo?.discount ?? 0),
          promo_code: promo?.code ?? undefined,
        },
        { client_id },
        (active) =>
          findExtensionConflict(id, current.end_date, input.end_date, toPeriods(active)) !== null
      )
    } catch (error) {
      // La transaction ne peut porter qu'une `Error` nue : le code métier lui
      // est rendu ici, la couche modèle n'ayant pas à connaître les statuts
      // HTTP.
      if (error instanceof Error && error.message === 'booking_period_conflict') {
        throw new DomainError(
          'booking_period_conflict',
          'Ce bien est déjà réservé sur la période demandée.',
          409
        )
      }
      throw error
    }

    if (!booking) {
      throw new DomainError('booking_not_found', 'Réservation introuvable.', 404)
    }

    return booking
  }

  private async validatePromoCode(code: string, clientId: string, subtotal: number) {
    try {
      return await this.promoRepo.validate(code, clientId, subtotal)
    } catch (error) {
      if (error instanceof Error && error.message === 'invalid_promo_code') {
        throw new DomainError('invalid_promo_code', 'Code promo invalide ou expiré.', 422)
      }
      if (error instanceof Error && error.message === 'promo_min_amount_not_reached') {
        throw new DomainError(
          'promo_min_amount_not_reached',
          'Le montant minimum du séjour pour ce code promo n’est pas atteint.',
          422
        )
      }
      if (error instanceof Error && error.message === 'promo_user_limit_reached') {
        throw new DomainError(
          'promo_user_limit_reached',
          'Vous avez déjà utilisé ce code promo le nombre maximum de fois autorisé.',
          422
        )
      }

      throw error
    }
  }
}

export default UpdateBookingUseCase
