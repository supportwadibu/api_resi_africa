import { DomainError } from '#utils/domain_error'

import type { PromoCodeDto, UpdatePromoCodeInput } from '../dto/promo_code.dto.ts'
import PromoCodeAdminRepository from '../repositories/promo_code_repository.ts'
import { assertPromoCodeCoherent } from './promo_code_rules.ts'

export class UpdatePromoCodeUseCase {
  constructor(private repo: PromoCodeAdminRepository = new PromoCodeAdminRepository()) {}

  async execute(id: string, input: UpdatePromoCodeInput): Promise<PromoCodeDto> {
    const current = await this.repo.findById(id)
    if (!current) {
      throw new DomainError('promo_code_not_found', 'Code promo introuvable.', 404)
    }

    // `null` efface une borne, `undefined` la laisse en place : la distinction
    // doit survivre à la fusion.
    assertPromoCodeCoherent({
      type: input.type ?? current.type,
      value: input.value ?? current.value,
      starts_at: input.starts_at === undefined ? current.starts_at : input.starts_at,
      expires_at: input.expires_at === undefined ? current.expires_at : input.expires_at,
    })

    const updated = await this.repo.update(id, input)
    if (!updated) {
      throw new DomainError('promo_code_not_found', 'Code promo introuvable.', 404)
    }
    return updated
  }
}

export default UpdatePromoCodeUseCase
