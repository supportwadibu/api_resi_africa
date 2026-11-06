import { buildClientExport, type ClientExport } from '../client_transfer.ts'
import { ClientTransferRepository } from '../repositories/client_transfer_repository.ts'

/**
 * Exporte le carnet clients de toute la plateforme, réservé au back-office.
 *
 * Le fichier rendu se suffit à lui-même : `ImportClientsUseCase` le relit
 * après une remise à zéro de la base.
 */
export default class ExportClientsUseCase {
  constructor(private readonly repo = new ClientTransferRepository()) {}

  async execute(): Promise<ClientExport> {
    const records = await this.repo.findAllClients()
    const owners = await this.repo.findOwnerIdentities(records.map((r) => r.owner_id))

    return buildClientExport(records, owners, new Date())
  }
}
