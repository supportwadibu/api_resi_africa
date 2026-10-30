import { ClosePendingBookingPaymentUseCase } from '#features/booking_payments/use_cases/close_pending_booking_payment.use_case'
import { RefundBookingPaymentUseCase } from '#features/booking_payments/use_cases/refund_booking_payment.use_case'
import { sponsorshipCreditOf } from '#features/booking_payments/sponsorship_credit'
import { RestoreStayCreditUseCase } from '#features/sponsorships/use_cases/restore_stay_credit.use_case'
import Booking from '#models/booking'
import { DomainError } from '#utils/domain_error'

import type { BookingDto, CancelBookingInput } from '../dto/booking.dto.ts'
import { buildCancellationPatch } from '../cancellation.ts'
import { syncReferrerCommissionExpense } from '../referrer_expense.ts'
import BookingRepository from '../repositories/booking_repository.ts'

/**
 * Annule une réservation du côté du propriétaire ou de son gérant.
 *
 * Distinct de `CancelBookingUseCase`, qui sert le flux en ligne : celui-ci est
 * cadré sur `client_id` — le client annule *sa* réservation — et ne peut donc
 * pas servir une saisie comptoir, dont le client n'est pas l'appelant. Les
 * cadrer tous deux sur l'identifiant de l'appelant serait une confusion : le
 * `client_id` d'une réservation comptoir désigne une fiche du carnet, pas un
 * compte connecté.
 *
 * Règles d'annulation et sort de ce qui a été payé : voir
 * `buildCancellationPatch`. Un paiement en ligne remboursé l'est par Wave,
 * **avant** l'écriture de l'annulation : si Wave refuse, la réservation reste
 * active et le propriétaire peut réessayer.
 */
export class CancelOwnerBookingUseCase {
  constructor(
    private refunds: RefundBookingPaymentUseCase = new RefundBookingPaymentUseCase(),
    private pendingPayments: ClosePendingBookingPaymentUseCase = new ClosePendingBookingPaymentUseCase(),
    private stayCredit: RestoreStayCreditUseCase = new RestoreStayCreditUseCase()
  ) {}

  async execute(id: string, ownerId: string, input: CancelBookingInput = {}): Promise<BookingDto> {
    const booking = await Booking.findById(id)
    if (!booking || booking.owner_id !== ownerId) {
      throw new DomainError('booking_not_found', 'Réservation introuvable.', 404)
    }

    // Avant de chercher le paiement encaissé : une session restée ouverte
    // laisserait le client payer après l'annulation, et une session payée à
    // l'instant doit être vue pour que son sort soit décidé ici.
    await this.pendingPayments.execute(id)

    const onlinePayment = await this.refunds.findPaid(id)
    // Crédit parrainage compris : un séjour réglé en crédit est payé, et le
    // propriétaire, qui en a été crédité, doit dire s'il le garde ou le rend.
    const patch = buildCancellationPatch(
      {
        ...booking,
        online_paid_amount: onlinePayment
          ? onlinePayment.amount + sponsorshipCreditOf(onlinePayment)
          : 0,
      },
      input
    )

    if (onlinePayment && patch.cancellation_deposit_action === 'refund') {
      await this.refunds.execute(onlinePayment, {
        id: booking._id,
        owner_id: booking.owner_id,
        residence_id: booking.residence_id ?? null,
      })
    }

    const updated = await Booking.findOneAndUpdate(id, { ...patch }, { owner_id: ownerId })

    if (!updated) {
      throw new DomainError('booking_not_found', 'Réservation introuvable.', 404)
    }

    // Le bien redevient disponible : une réservation annulée ne doit pas
    // continuer de bloquer le calendrier.
    await new BookingRepository().markPropertyAsAvailable(booking.property_id)
    // Une commission ne survit pas à l'annulation : son reflet est retiré.
    await syncReferrerCommissionExpense(updated)
    // Le crédit parrainage suit le sort de l'argent : rendu avec lui, ou gardé
    // par le propriétaire avec l'acompte.
    const kept = onlinePayment !== null && patch.cancellation_deposit_action !== 'refund'
    if (!kept) {
      await this.stayCredit.execute({
        id: booking._id,
        client_id: booking.client_id,
        sponsorship_credit_amount: booking.sponsorship_credit_amount,
      })
    }

    return BookingRepository.toDto(updated)
  }
}

export default CancelOwnerBookingUseCase
