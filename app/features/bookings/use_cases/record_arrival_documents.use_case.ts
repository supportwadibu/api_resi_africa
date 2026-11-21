import ClientRepository from '#features/clients/repositories/client_repository'
import CreateClientUseCase from '#features/clients/use_cases/create_client.use_case'
import UpdateClientUseCase from '#features/clients/use_cases/update_client.use_case'
import type { ClientIdentityInput } from '#features/clients/client_identity'
import type { ClientDto } from '#features/clients/dto/client.dto'
import UserRepository from '#features/users/repositories/user_repository'
import type { ClientIdDocumentType } from '#models/client'
import { DomainError } from '#utils/domain_error'

import type { MultipartFile } from '@adonisjs/core/bodyparser'

import type { BookingDto } from '../dto/booking.dto.ts'
import BookingRepository from '../repositories/booking_repository.ts'

export interface ArrivalDocumentsInput extends ClientIdentityInput {
  id_document_type: ClientIdDocumentType
  id_document_number?: string | null
}

/** Ce qu'il faut d'une fiche du carnet pour juger son dossier. */
interface CardDocuments {
  id_document_type: string | null
  has_document_front: boolean
}

/**
 * Le dossier suffit-il pour remettre les clés ?
 *
 * Nature de la pièce et recto : un passeport n'a qu'une face utile, exiger le
 * verso — comme `documents_status` — bloquerait son porteur au comptoir.
 */
export function hasArrivalDocuments(card: CardDocuments | null): boolean {
  return card !== null && card.id_document_type !== null && card.has_document_front
}

type Sources = {
  bookings: Pick<BookingRepository, 'findById'>
  clients: Pick<ClientRepository, 'findById' | 'findByPhone'>
  users: Pick<UserRepository, 'findEntity'>
}

/**
 * Fiche du carnet du propriétaire qui correspond au client d'une réservation.
 *
 * Saisie au comptoir : `client_id` désigne déjà une fiche du carnet. Réservation
 * en ligne : il désigne un compte de l'app client, et la fiche se retrouve par
 * son numéro — clé de dédoublonnage du carnet. Le carnet est propre à chaque
 * propriétaire : les pièces déposées chez l'un ne se voient jamais chez un
 * autre, qui les redemandera à son tour.
 *
 * `null` quand aucune fiche n'existe encore ; [account] rend alors le compte,
 * de quoi en créer une.
 */
export async function findArrivalCard(
  booking: Pick<BookingDto, 'client_id'>,
  ownerId: string,
  sources: Omit<Sources, 'bookings'>
): Promise<{
  card: ClientDto | null
  account: { full_name: string; phone: string | null } | null
}> {
  const carnet = await sources.clients.findById(booking.client_id, ownerId)
  if (carnet) return { card: ClientRepository.toDto(carnet), account: null }

  const user = await sources.users.findEntity(booking.client_id)
  if (!user) return { card: null, account: null }
  const account = { full_name: user.full_name, phone: user.phone ?? null }
  if (!account.phone) return { card: null, account }

  const byPhone = await sources.clients.findByPhone(ownerId, account.phone)
  return { card: byPhone ? ClientRepository.toDto(byPhone) : null, account }
}

/**
 * Pièces d'identité présentées à l'arrivée, après le scan de la réservation.
 *
 * Un client inscrit sur l'app peut réserver sans pièce ; c'est à l'entrée
 * dans la résidence que le propriétaire (ou son gérant) les enregistre, dans
 * **son** carnet. La fiche est créée au besoin à partir du compte du client.
 */
export class RecordArrivalDocumentsUseCase {
  constructor(
    private sources: Sources = {
      bookings: new BookingRepository(),
      clients: new ClientRepository(),
      users: new UserRepository(),
    },
    private createClient: Pick<CreateClientUseCase, 'execute'> = new CreateClientUseCase(),
    private updateClient: Pick<UpdateClientUseCase, 'execute'> = new UpdateClientUseCase()
  ) {}

  async execute(input: {
    booking_id: string
    owner_id: string
    /** Gérant auteur de la saisie ; `null` pour le propriétaire. */
    created_by?: string | null
    documents: ArrivalDocumentsInput
    files: { front: MultipartFile; back?: MultipartFile | null }
  }): Promise<ClientDto> {
    const booking = await this.sources.bookings.findById(input.booking_id)
    // Même réponse pour une réservation inconnue et pour celle d'un autre.
    if (!booking || booking.owner_id !== input.owner_id) {
      throw new DomainError('booking_not_found', 'Réservation introuvable.', 404)
    }

    const { card, account } = await findArrivalCard(booking, input.owner_id, this.sources)
    const cardId = card?.id ?? (await this.createCard(input, account))

    return this.updateClient.execute(cardId, input.owner_id, input.documents, input.files)
  }

  /** Première venue chez ce propriétaire : sa fiche naît du compte du client. */
  private async createCard(
    input: { owner_id: string; created_by?: string | null },
    account: { full_name: string; phone: string | null } | null
  ): Promise<string> {
    if (!account?.phone) {
      // Compte supprimé, ou sans numéro (connexion par e-mail) : rien pour
      // nommer la fiche ni la retrouver à la prochaine venue.
      throw new DomainError(
        'arrival_client_unknown',
        'Ce client n’a pas de numéro de téléphone : enregistrez-le depuis le carnet.',
        422
      )
    }
    const { client } = await this.createClient.execute({
      owner_id: input.owner_id,
      full_name: account.full_name,
      phone: account.phone,
      created_by: input.created_by ?? null,
    })
    if (!client) {
      throw new DomainError('client_not_found', 'Client introuvable.', 404)
    }
    return client.id
  }
}

export default RecordArrivalDocumentsUseCase
