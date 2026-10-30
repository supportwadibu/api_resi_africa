import { ClosePendingBookingPaymentUseCase } from '#features/booking_payments/use_cases/close_pending_booking_payment.use_case'
import BookingRepository from '#features/bookings/repositories/booking_repository'
import type { BookingDto } from '#features/bookings/dto/booking.dto'
import { CreditBookingPaymentUseCase } from '#features/wallets/use_cases/index'
import Sponsorship, { stayCreditPaymentId } from '#models/sponsorship'
import { DomainError } from '#utils/domain_error'

/**
 * Règle tout ou partie d'une réservation en ligne avec le crédit séjour du
 * client.
 *
 * RESI finance ce crédit : le propriétaire est crédité du prix plein, la part
 * couverte par le crédit s'ajoutant à ce que paie Wave. Le crédit couvre-t-il
 * tout le séjour, la réservation est payée sur-le-champ ; sinon, la session
 * Wave suivante ne demande que le reste.
 */
export class ApplyStayCreditUseCase {
  constructor(
    private bookings: Pick<BookingRepository, 'findById'> = new BookingRepository(),
    private pendingPayments: Pick<
      ClosePendingBookingPaymentUseCase,
      'execute'
    > = new ClosePendingBookingPaymentUseCase(),
    private credit: Pick<CreditBookingPaymentUseCase, 'execute'> = new CreditBookingPaymentUseCase()
  ) {}

  async execute(bookingId: string, clientId: string): Promise<BookingDto> {
    const booking = await this.bookings.findById(bookingId)
    if (!booking || booking.client_id !== clientId) {
      throw new DomainError('booking_not_found', 'Réservation introuvable.', 404)
    }

    // Une session ouverte au prix plein ne doit pas rester payable : payée
    // après coup, elle encaisserait en plus du crédit.
    await this.pendingPayments.execute(bookingId)

    const now = new Date()
    const result = await Sponsorship.applyStayCredit({
      booking_id: bookingId,
      client_id: clientId,
      now,
    })

    if (!result.ok) throw this.toDomainError(result.reason)

    if (result.fully_paid) {
      await this.credit.execute({
        owner_id: result.booking.owner_id,
        residence_id: result.booking.residence_id ?? null,
        booking_id: bookingId,
        booking_payment_id: stayCreditPaymentId(bookingId),
        amount: result.amount,
      })
    }

    return BookingRepository.toDto(result.booking)
  }

  private toDomainError(reason: string): DomainError {
    switch (reason) {
      case 'booking_not_found':
        return new DomainError('booking_not_found', 'Réservation introuvable.', 404)
      case 'booking_already_paid':
        return new DomainError('booking_already_paid', 'Cette réservation est déjà payée.', 409)
      case 'credit_already_applied':
        return new DomainError(
          'sponsorship_credit_already_applied',
          'Votre crédit parrainage est déjà appliqué à cette réservation.',
          409
        )
      case 'no_stay_credit':
        return new DomainError(
          'no_stay_credit',
          'Vous n’avez pas de crédit séjour à utiliser.',
          422
        )
      default:
        return new DomainError(
          'booking_not_payable',
          'Cette réservation ne peut pas être payée.',
          409
        )
    }
  }
}

export default ApplyStayCreditUseCase
