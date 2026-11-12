import BookingPaymentRepository from '#features/booking_payments/repositories/booking_payment_repository'
import { DomainError } from '#utils/domain_error'

import { parseArrivalCode } from '../arrival_code.ts'
import type { BookingDto } from '../dto/booking.dto.ts'
import BookingRepository from '../repositories/booking_repository.ts'
import { assertArrivalPaid, buildCheckInPatch } from './check_in_booking.use_case.ts'

/** Ce que l'écran d'arrivée affiche en plus de la réservation. */
export interface ArrivalCheck {
  /** Le paiement en ligne — total ou acompte — est encaissé. */
  online_paid: boolean
  /** Rien ne s'oppose à l'arrivée : ni reste dû, ni date. */
  can_check_in: boolean
  /** Première raison d'attendre, au format d'une erreur de l'API ; `null` sinon. */
  blocker: { code: string; message: string } | null
}

export interface ArrivalBookingDto {
  booking: BookingDto
  check: ArrivalCheck
}

/**
 * Retrouve la réservation présentée au comptoir — QR scanné ou PIN saisi — et
 * dit si les clés peuvent être remises.
 *
 * Un code inconnu, et celui d'une réservation d'un autre propriétaire,
 * rendent la même réponse : rien ne doit permettre de sonder les codes des
 * autres. Le PIN ne cherche que parmi les réservations à venir du
 * propriétaire ; la route qui l'appelle borne le nombre d'essais.
 *
 * [propertyIds] : périmètre d'un gérant, `null` pour le propriétaire.
 */
export class FindArrivalBookingUseCase {
  constructor(
    private repo: Pick<
      BookingRepository,
      'findByCheckInToken' | 'findByCheckInPin'
    > = new BookingRepository(),
    private payments: Pick<
      BookingPaymentRepository,
      'findSucceededByBooking'
    > = new BookingPaymentRepository()
  ) {}

  async execute(
    rawCode: string,
    ownerId: string,
    propertyIds: readonly string[] | null = null,
    now: Date = new Date()
  ): Promise<ArrivalBookingDto> {
    const booking = await this.find(rawCode, ownerId)
    if (!booking || (propertyIds && !propertyIds.includes(booking.property_id))) {
      throw new DomainError('arrival_code_unknown', 'Code non reconnu.', 404)
    }

    const payment = await this.payments.findSucceededByBooking(booking.id)
    let blocker: ArrivalCheck['blocker'] = null
    try {
      buildCheckInPatch(booking, undefined, now)
      assertArrivalPaid(booking, payment !== null)
    } catch (error) {
      if (!(error instanceof DomainError)) throw error
      blocker = { code: error.code, message: error.message }
    }

    return {
      booking,
      check: { online_paid: payment !== null, can_check_in: blocker === null, blocker },
    }
  }

  private async find(rawCode: string, ownerId: string): Promise<BookingDto | null> {
    const code = parseArrivalCode(rawCode)
    if (!code) return null

    if (code.kind === 'token') {
      const booking = await this.repo.findByCheckInToken(code.value)
      return booking?.owner_id === ownerId ? booking : null
    }

    const matches = await this.repo.findByCheckInPin(ownerId, code.value)
    if (matches.length > 1) {
      throw new DomainError(
        'arrival_pin_ambiguous',
        'Ce code désigne plusieurs réservations : scannez le QR du client.',
        409
      )
    }
    return matches[0] ?? null
  }
}

export default FindArrivalBookingUseCase
