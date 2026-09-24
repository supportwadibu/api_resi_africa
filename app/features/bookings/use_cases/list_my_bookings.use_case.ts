/* eslint-disable prettier/prettier */
import type {
  ListBookingsInput,
  ListBookingsOutput,
} from '../dto/booking.dto.ts'
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
  constructor(private repo: BookingRepository = new BookingRepository()) {}

  async execute(
    client_id: string,
    input: Omit<ListBookingsInput, 'client_id'> = {}
  ): Promise<ListBookingsOutput> {
    const { data, total, page, perPage } = await this.repo.paginate({ ...input, client_id })
    return {
      data,
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
