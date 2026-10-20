import { DomainError } from '#utils/domain_error'

import { buildManagerOverview } from '../manager_overview.ts'

import type { FinanceOverviewDto } from '../dto/finance.dto.ts'
import type { ManagerOverviewDto } from '../manager_overview.ts'
import type { ActorScope } from '#features/managers/scope'
import FinanceRepository from '../repositories/finance_repository.ts'

export class GetFinanceOverviewUseCase {
  constructor(private repo: FinanceRepository = new FinanceRepository()) {}

  /**
   * Relevé d'un gérant : le brut de son périmètre, jamais le net.
   *
   * Méthode distincte de `execute` plutôt qu'un champ conditionnel sur le même
   * relevé : le type de retour ne porte alors aucun `benefice_net`, et aucun
   * oubli d'appelant ne peut le laisser fuir. Un net calculé sur un périmètre
   * partiel déduirait des charges qui ne relèvent pas du gérant — abonnement du
   * propriétaire, charges communes, dépenses d'autres logements — et ne serait
   * pas une marge partielle mais un chiffre faux.
   */
  async executeForManager(
    scope: ActorScope,
    range: { from: Date; to: Date }
  ): Promise<ManagerOverviewDto> {
    const { bookings, expenses } = await this.repo.managerInputs({
      owner_id: scope.ownerId,
      scope,
      ...range,
    })

    return buildManagerOverview({ scope, bookings, expenses, ...range })
  }

  async execute(
    owner_id: string,
    filters: {
      from?: Date
      to?: Date
      residence_id?: string
      property_id?: string
      scope_property_ids?: string[] | null
    } = {}
  ): Promise<FinanceOverviewDto> {
    const overview = await this.repo.overview({ ...filters, owner_id })

    // Une résidence ou un logement inconnu — ou appartenant à un autre propriétaire — rendrait
    // un relevé à zéro, indistinguable d'un bien sans activité.
    if (!overview) {
      if (filters.property_id) {
        throw new DomainError('property_not_found', 'Logement introuvable.', 404)
      }
      throw new DomainError('residence_not_found', 'Résidence introuvable.', 404)
    }

    return overview
  }
}

export default GetFinanceOverviewUseCase
