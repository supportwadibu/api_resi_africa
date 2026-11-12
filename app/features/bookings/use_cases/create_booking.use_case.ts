/* eslint-disable prettier/prettier */
import { DomainError } from '#utils/domain_error'

import type { BookingDto, CreateBookingInput } from '../dto/booking.dto.ts'
import BookingRepository from '../repositories/booking_repository.ts'
import PromoCodeRepository from '../repositories/promo_code_repository.ts'
import { negotiatedPricing } from '../stay_pricing.ts'
import {
  activeCommissionRule,
  onlineBookingAmounts,
  priceOnlineStay,
} from '#features/commissions/commission_rules'
import CommissionRepository from '#features/commissions/repositories/commission_repository'
import Negotiation from '#models/negotiation'
import { depositBookingFields, effectiveDepositRule } from '#features/deposits/deposit_rules'
import DepositRepository from '#features/deposits/repositories/deposit_repository'

import { generateArrivalCode } from '../arrival_code.ts'

export class CreateBookingUseCase {
  constructor(
    private repo: BookingRepository = new BookingRepository(),
    private promoRepo: PromoCodeRepository = new PromoCodeRepository(),
    private negotiations: Pick<typeof Negotiation, 'offers'> = Negotiation,
    private commissions: Pick<CommissionRepository, 'settings'> = new CommissionRepository(),
    private deposits: Pick<DepositRepository, 'settings'> = new DepositRepository()
  ) {}

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

    const negotiated = input.negotiation_level
      ? await this.negotiatedPrice(property, input.client_id, input.negotiation_level)
      : null
    if (negotiated !== null && input.promo_code) {
      throw new DomainError(
        'promo_not_with_negotiation',
        'Un code promo ne s’ajoute pas à un prix négocié.',
        422
      )
    }

    const [settings, depositSettings] = await Promise.all([
      this.commissions.settings(),
      this.deposits.settings(),
    ])
    const price = priceOnlineStay(
      negotiated === null ? property.pricing : negotiatedPricing(property.pricing, negotiated),
      input.start_date,
      input.end_date,
      activeCommissionRule(settings)
    )
    // Le code promo porte sur ce que voit le client : c'est à ce montant que
    // s'applique son minimum de séjour.
    const promo = input.promo_code
      ? await this.validatePromoCode(input.promo_code, input.client_id, price.client.subtotal)
      : null

    const amounts = onlineBookingAmounts(price, promo?.discount ?? 0)
    // Calculé sur ce que paie vraiment le client, code promo déduit : c'est
    // sur ce montant que la part de RESI doit tenir dans l'acompte.
    const deposit = depositBookingFields(
      input.payment_option ?? 'full',
      effectiveDepositRule(depositSettings, property.deposit),
      amounts.client_total_amount ?? amounts.total_amount,
      amounts.total_amount
    )

    try {
      return await this.repo.create({
        ...input,
        owner_id: ownerId,
        // Figé à la création : déplacer l'unité plus tard ne doit pas
        // réimputer un chiffre d'affaires déjà constaté.
        residence_id: property.residence_id ?? null,
        ...amounts,
        ...deposit,
        arrival: generateArrivalCode(),
        promo_code: promo?.code ?? undefined,
        promo_code_id: promo?.id ?? null,
        negotiation_level: negotiated === null ? undefined : input.negotiation_level,
        list_daily_price: negotiated === null ? undefined : property.pricing.daily_price,
      })
    } catch (error) {
      this.mapTechnicalError(error)
    }
  }

  /**
   * Prix d'un palier que le serveur a lui-même révélé à ce client : le
   * palier est relu dans sa négociation, jamais pris de la requête. Le bien
   * doit être encore négociable — un propriétaire qui coupe la négociation
   * n'honore plus les offres en cours.
   */
  private async negotiatedPrice(
    property: { _id: string; negotiation?: { enabled: boolean } },
    clientId: string,
    level: number
  ): Promise<number> {
    const offers = property.negotiation?.enabled
      ? await this.negotiations.offers(property._id, clientId, new Date())
      : []
    const price = offers[level - 1]
    if (price === undefined) {
      throw new DomainError(
        'negotiation_offer_unavailable',
        'Ce prix négocié n’est plus disponible. Négociez à nouveau ou réservez au prix normal.',
        409
      )
    }
    return price
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
