import { DomainError } from '#utils/domain_error'

import PromoCodeAdminRepository from '../repositories/promo_code_repository.ts'

/**
 * Supprime un code jamais utilisé.
 *
 * Un code déjà appliqué est référencé par ses utilisations et par les
 * réservations qui en portent le nom : le supprimer ferait perdre la trace de
 * remises consenties. Il se désactive à la place.
 */
export class DeletePromoCodeUseCase {
  constructor(private repo: PromoCodeAdminRepository = new PromoCodeAdminRepository()) {}

  async execute(id: string): Promise<void> {
    const current = await this.repo.findById(id)
    if (!current) {
      throw new DomainError('promo_code_not_found', 'Code promo introuvable.', 404)
    }

    if (current.uses_count > 0) {
      throw new DomainError(
        'promo_code_in_use',
        'Ce code a déjà été utilisé : désactivez-le plutôt que de le supprimer.',
        409
      )
    }

    await this.repo.delete(id)
  }
}

export default DeletePromoCodeUseCase
