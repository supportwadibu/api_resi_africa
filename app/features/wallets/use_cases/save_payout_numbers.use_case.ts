import WalletRepository from '../repositories/wallet_repository.ts'
import { normalizePayoutNumbers, type PayoutNumber } from '../wallet_rules.ts'

/**
 * Remplace les numéros Wave du propriétaire.
 *
 * La liste entière est envoyée : ajout, modification et retrait d'un numéro
 * deviennent une seule écriture, et l'état obtenu ne dépend pas de l'ordre
 * des requêtes. Les demandes déjà envoyées gardent le numéro figé à la
 * demande.
 */
export class SavePayoutNumbersUseCase {
  constructor(private repo: WalletRepository = new WalletRepository()) {}

  async execute(
    ownerId: string,
    input: Array<{ slot: number; phone: string; holder_name?: string | null }>
  ): Promise<PayoutNumber[]> {
    return this.repo.replacePayoutNumbers(ownerId, normalizePayoutNumbers(input))
  }
}

export default SavePayoutNumbersUseCase
