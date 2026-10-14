/* eslint-disable prettier/prettier */
import BookingPaymentRepository from '#features/booking_payments/repositories/booking_payment_repository'
import PropertyRepository from '#features/properties/repositories/property_repository'

import { attachClientView } from '../client_booking_view.ts'
import type { ListBookingsInput, ListBookingsOutput } from '../dto/booking.dto.ts'
import BookingRepository from '../repositories/booking_repository.ts'

/**
 * Réservations du client connecté, pour lui-même.
 *
 * Le premier argument est l'identifiant de l'appelant, jamais celui d'une
 * fiche consultée : il n'y a donc **aucun périmètre** à appliquer ici. Pour
 * lire l'historique d'un client du carnet — vu par un propriétaire ou par un
 * gérant, qui lui est cloisonné —, c'est
 * `#features/clients/use_cases/list_client_bookings.use_case` qu'il faut.
 */
export class ListMyBookingsUseCase {
  constructor(
    private repo: BookingRepository = new BookingRepository(),
    private properties: PropertyRepository = new PropertyRepository(),
    private payments: BookingPaymentRepository = new BookingPaymentRepository()
  ) {}

  async execute(
    client_id: string,
    input: Omit<ListBookingsInput, 'client_id'> = {}
  ): Promise<ListBookingsOutput> {
    const { data, total, page, perPage } = await this.repo.paginate({ ...input, client_id })
    // Deux lectures groupées, quel que soit le nombre de lignes : sans elles,
    // l'app n'aurait qu'un identifiant de bien à afficher et ne saurait pas
    // distinguer une réservation payée d'une réservation en attente.
    const [properties, payments] = await Promise.all([
      this.properties.findManyByIds(data.map((b) => b.property_id)),
      this.payments.findByBookings(data.map((b) => b.id)),
    ])
    return {
      data: attachClientView(data, properties, payments),
      meta: {
        total,
        perPage,
        currentPage: page,
        lastPage: Math.max(1, Math.ceil(total / perPage)),
      },
    }
  }
}

export default ListMyBookingsUseCase
