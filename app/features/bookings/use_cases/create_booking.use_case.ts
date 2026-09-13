/* eslint-disable prettier/prettier */
import { DomainError } from '#utils/domain_error'

import type {
  BookingDto,
  CreateBookingInput,
} from '../dto/booking.dto.ts'
import BookingRepository from '../repositories/booking_repository.ts'
import PromoCodeRepository from '../repositories/promo_code_repository.ts'
import { calculateStayPrice } from '../stay_pricing.ts'

export class CreateBookingUseCase {
  constructor(
    private repo: BookingRepository = new BookingRepository(),
    private promoRepo: PromoCodeRepository = new PromoCodeRepository()
  ) { }

  async execute(input: CreateBookingInput): Promise<BookingDto> {
    const property = await this.repo.getAvailablePropertyForBooking(input.property_id)
    if (!property) {
      throw new DomainError('property_not_available', 'Propriété indisponible.', 404)
    }
    const ownerId = property.owner_id.toString()
    if (ownerId === input.client_id) {
      throw new DomainError(
        'invalid_booking_owner',
        'Vous ne pouvez pas réserver votre propriété.',
        422
      )
    }

    const price = calculateStayPrice(property.pricing, input.start_date, input.end_date)
    const promo = input.promo_code
      ? await this.validatePromoCode(input.promo_code, input.client_id, price.subtotal)
      : null

    try {
      return await this.repo.create({
        ...input,
        owner_id: ownerId,
        // Figé à la création : déplacer l'unité plus tard ne doit pas
        // réimputer un chiffre d'affaires déjà constaté.
        residence_id: property.residence_id ?? null,
        days_count: price.days,
        daily_price: price.dailyPrice,
        duration_discount_percent: price.discountPercent,
        subtotal_amount: price.subtotal,
        discount_amount: promo?.discount ?? 0,
        total_amount: price.subtotal - (promo?.discount ?? 0),
        promo_code: promo?.code ?? undefined,
        promo_code_id: promo?.id ?? null,
      })
    } catch (error) {
      this.mapTechnicalError(error)
    }
  }

  private async validatePromoCode(code: string, clientId: string, subtotal: number) {
    try {
      return await this.promoRepo.validate(code, clientId, subtotal)
    } catch (error) {
      this.mapTechnicalError(error)
    }
  }

  private mapTechnicalError(error: unknown): never {
    if (error instanceof Error) {
      if (error.message === 'property_not_available') {
        throw new DomainError('property_not_available', 'Propriété déjà indisponible.', 409)
      }
      if (error.message === 'invalid_promo_code') {
        throw new DomainError('invalid_promo_code', 'Code promo invalide ou expiré.', 422)
      }
      if (error.message === 'promo_min_amount_not_reached') {
        throw new DomainError(
          'promo_min_amount_not_reached',
          'Le montant minimum du séjour pour ce code promo n’est pas atteint.',
          422
        )
      }
      if (error.message === 'promo_user_limit_reached') {
        throw new DomainError(
          'promo_user_limit_reached',
          'Vous avez déjà utilisé ce code promo le nombre maximum de fois autorisé.',
          422
        )
      }
      if (error.message === 'promo_usage_limit_reached') {
        throw new DomainError(
          'promo_usage_limit_reached',
          'Ce code promo n’est plus disponible.',
          409
        )
      }
    }

    throw error
  }
}

export default CreateBookingUseCase
