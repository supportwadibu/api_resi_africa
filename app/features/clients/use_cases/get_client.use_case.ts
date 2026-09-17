import Booking from '#models/booking'
import Client from '#models/client'
import { signedDocumentUrl } from '#services/document_storage'
import { DomainError } from '#utils/domain_error'

import type { ClientDto, ClientStatsDto } from '../dto/client.dto.ts'
import ClientRepository from '../repositories/client_repository.ts'
import { computeClientStats } from './compute_client_stats.use_case.ts'

/**
 * Fiche complète, avec URLs signées vers les pièces déposées.
 *
 * Les URLs sont régénérées à chaque lecture : elles expirent, et les persister
 * produirait des liens morts au premier affichage différé.
 */
export class GetClientUseCase {
  constructor(private repo: ClientRepository = new ClientRepository()) {}

  /**
   * `scopePropertyIds` restreint les séjours pris en compte au périmètre de
   * l'appelant. Absent ou `null` — le propriétaire —, le comportement est
   * strictement celui d'avant le rôle gérant.
   */
  async execute(
    id: string,
    ownerId: string,
    scopePropertyIds?: string[] | null
  ): Promise<ClientDto> {
    const doc = await this.repo.findById(id, ownerId)
    if (!doc) {
      throw new DomainError('client_not_found', 'Client introuvable.', 404)
    }

    const dto = ClientRepository.toDto(doc)
    const stats = await this.refreshStats(doc._id, ownerId, dto.stats, scopePropertyIds)

    return {
      ...dto,
      stats,
      document_front_url: signedDocumentUrl(doc.id_document_front_public_id),
      document_back_url: signedDocumentUrl(doc.id_document_back_public_id),
    }
  }

  /**
   * Recalcule les statistiques depuis les réservations et réaligne le cache.
   *
   * Le champ `stats` de la fiche n'est qu'un cache : il sert la liste du
   * carnet, qui ne peut pas relire les réservations de chaque client sans
   * multiplier les lectures Firestore par la taille de la page. La vérité est
   * dans les réservations, et cette lecture est l'occasion de les réconcilier.
   *
   * L'écriture est conditionnée à un écart réel : réécrire un cache identique
   * ferait remonter la fiche en tête du carnet, trié sur `updated_at`, au seul
   * fait de l'avoir consultée.
   *
   * Un échec d'écriture ne fait pas échouer la lecture : le propriétaire doit
   * voir ses chiffres justes même si le cache n'a pas pu être rafraîchi.
   */
  private async refreshStats(
    clientId: string,
    ownerId: string,
    cached: ClientStatsDto,
    scopePropertyIds?: string[] | null
  ): Promise<ClientStatsDto> {
    const bookings = await Booking.findByClient(ownerId, clientId, scopePropertyIds)
    const fresh = computeClientStats(bookings)

    // Une lecture cloisonnée ne réécrit jamais le cache : les chiffres portent
    // alors sur les seuls logements du gérant, et les persister écraserait les
    // totaux du propriétaire par une vue partielle — le carnet se mettrait à
    // rétrécir au gré de qui le consulte.
    if (Array.isArray(scopePropertyIds)) return fresh

    if (!hasDrifted(cached, fresh)) return fresh

    try {
      await Client.updateStats(clientId, fresh)
    } catch {
      // Le cache reste périmé ; la prochaine lecture retentera.
    }

    return fresh
  }
}

/** Le cache s'écarte-t-il du calcul ? */
function hasDrifted(cached: ClientStatsDto, fresh: ClientStatsDto): boolean {
  return (
    cached.total_stays !== fresh.total_stays ||
    cached.total_paid !== fresh.total_paid ||
    (cached.last_stay_at?.getTime() ?? null) !== (fresh.last_stay_at?.getTime() ?? null)
  )
}

export default GetClientUseCase
