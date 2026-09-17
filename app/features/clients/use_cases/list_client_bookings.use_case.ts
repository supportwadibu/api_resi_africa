import Booking from '#models/booking'
import Property from '#models/property'
import { DomainError } from '#utils/domain_error'

import BookingRepository from '../../bookings/repositories/booking_repository.ts'
import ClientRepository from '../repositories/client_repository.ts'
import { computeClientStats } from './compute_client_stats.use_case.ts'

import type { BookingDto, BookingPropertySummary } from '../../bookings/dto/booking.dto.ts'
import type { ClientStatsDto } from '../dto/client.dto.ts'

export interface ListClientBookingsOutput {
  data: BookingDto[]
  /**
   * Statistiques recalculées sur la même lecture.
   *
   * Servies avec l'historique pour que l'application n'ait pas à les demander
   * une seconde fois, et pour qu'elles ne puissent pas contredire la liste
   * affichée juste en dessous.
   */
  stats: ClientStatsDto
}

/**
 * Historique des séjours d'un client du carnet.
 *
 * Non paginé : un client du carnet compte ses séjours en dizaines, et une
 * page partielle rendrait les statistiques incohérentes avec la liste.
 */
export class ListClientBookingsUseCase {
  constructor(private repo: ClientRepository = new ClientRepository()) {}

  /**
   * `scopePropertyIds` restreint l'historique au périmètre de l'appelant :
   * sans lui, un gérant lirait les séjours faits dans des logements qui ne lui
   * sont pas confiés. Absent ou `null` pour le propriétaire.
   */
  async execute(
    clientId: string,
    ownerId: string,
    scopePropertyIds?: string[] | null
  ): Promise<ListClientBookingsOutput> {
    // L'existence de la fiche est vérifiée dans le carnet du propriétaire :
    // sans ce contrôle, un identifiant deviné renverrait une liste vide plutôt
    // qu'un refus, révélant qu'aucune fiche ne porte cet identifiant.
    const client = await this.repo.findById(clientId, ownerId)
    if (!client) {
      throw new DomainError('client_not_found', 'Client introuvable.', 404)
    }

    const bookings = await Booking.findByClient(ownerId, clientId, scopePropertyIds)

    return {
      data: await withProperties(bookings.map(BookingRepository.toDto)),
      stats: computeClientStats(bookings),
    }
  }
}

/**
 * Joint à chaque séjour le résumé de son bien.
 *
 * Les identifiants sont dédoublonnés : un client fidèle revient souvent dans
 * le même logement, et Firestore facture chaque lecture. Un bien supprimé
 * depuis laisse le résumé absent plutôt que de faire échouer l'historique.
 */
async function withProperties(bookings: BookingDto[]): Promise<BookingDto[]> {
  const ids = [...new Set(bookings.map((booking) => booking.property_id).filter(Boolean))]
  if (ids.length === 0) return bookings

  const summaries = new Map<string, BookingPropertySummary>()

  await Promise.all(
    ids.map(async (id) => {
      const property = await Property.findById(id)
      if (!property) return

      summaries.set(id, {
        id: property._id,
        title: property.title,
        city: property.address?.city ?? '',
        image: property.media?.images?.[0] ?? null,
      })
    })
  )

  return bookings.map((booking) => {
    const property = summaries.get(booking.property_id)
    return property ? { ...booking, property } : booking
  })
}

export default ListClientBookingsUseCase
