import type { EarlyCheckOutQuoteDto } from '../dto/booking.dto.ts'
import { quoteEarlyCheckOut } from '../early_check_out.ts'
import { findClosableBooking } from './check_out_booking.use_case.ts'

/**
 * Chiffre un départ anticipé sans rien écrire.
 *
 * Le mobile affiche ce prorata avant que le propriétaire ne valide : le
 * calcul reste ainsi ici seul, et l'écran ne peut pas proposer un montant que
 * la clôture recalculerait autrement.
 */
export class PreviewCheckOutUseCase {
  async execute(id: string, ownerId: string, at?: Date): Promise<EarlyCheckOutQuoteDto> {
    const now = new Date()
    const booking = await findClosableBooking(id, ownerId, now)

    return quoteEarlyCheckOut(booking, at ?? now, now)
  }
}

export default PreviewCheckOutUseCase
