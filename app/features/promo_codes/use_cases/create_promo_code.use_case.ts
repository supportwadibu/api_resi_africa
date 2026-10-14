import { normalizeCode } from '#models/promo_code'
import { DomainError } from '#utils/domain_error'

import type { CreatePromoCodeInput, PromoCodeDto } from '../dto/promo_code.dto.ts'
import PromoCodeAdminRepository from '../repositories/promo_code_repository.ts'
import { assertPromoCodeCoherent } from './promo_code_rules.ts'

export class CreatePromoCodeUseCase {
  constructor(private repo: PromoCodeAdminRepository = new PromoCodeAdminRepository()) {}

  async execute(input: CreatePromoCodeInput): Promise<PromoCodeDto> {
    assertPromoCodeCoherent({
      type: input.type,
      value: input.value,
      starts_at: input.starts_at ?? null,
      expires_at: input.expires_at ?? null,
    })

    // Contrôle préalable pour rendre un code d'erreur stable : le modèle lève
    // une `Error` brute sur un doublon, le code normalisé étant la clé du
    // document.
    if (await this.repo.findById(normalizeCode(input.code))) {
      throw new DomainError('promo_code_already_exists', 'Ce code promo existe déjà.', 409)
    }

    return this.repo.create(input)
  }
}

export default CreatePromoCodeUseCase
