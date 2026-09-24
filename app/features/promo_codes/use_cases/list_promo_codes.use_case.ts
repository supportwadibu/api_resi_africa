import type { PromoCodeDto } from '../dto/promo_code.dto.ts'
import PromoCodeAdminRepository from '../repositories/promo_code_repository.ts'

/** Codes promo, du plus récent au plus ancien. Leur nombre reste de l'ordre de la dizaine. */
export class ListPromoCodesUseCase {
  constructor(private repo: PromoCodeAdminRepository = new PromoCodeAdminRepository()) {}

  async execute(): Promise<PromoCodeDto[]> {
    return this.repo.list()
  }
}

export default ListPromoCodesUseCase
