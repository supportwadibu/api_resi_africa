import { DomainError } from '#utils/domain_error'

import type { FinanceOverviewDto } from '../dto/finance.dto.ts'
import FinanceRepository from '../repositories/finance_repository.ts'

export class GetFinanceOverviewUseCase {
  constructor(private repo: FinanceRepository = new FinanceRepository()) {}

  async execute(
    owner_id: string,
    filters: { from?: Date; to?: Date; residence_id?: string } = {}
  ): Promise<FinanceOverviewDto> {
    const overview = await this.repo.overview({ ...filters, owner_id })

    // Une résidence inconnue — ou appartenant à un autre propriétaire — rendrait
    // un relevé à zéro, indistinguable d'une résidence sans activité.
    if (!overview) {
      throw new DomainError('residence_not_found', 'Résidence introuvable.', 404)
    }

    return overview
  }
}

export default GetFinanceOverviewUseCase
