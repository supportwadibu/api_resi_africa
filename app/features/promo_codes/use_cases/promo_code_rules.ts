import { DomainError } from '#utils/domain_error'

import type { PromoCodeType } from '../dto/promo_code.dto.ts'

/** Champs dont la cohérence se juge ensemble, sur le code complet. */
export interface PromoCodeShape {
  type: PromoCodeType
  value: number
  starts_at: Date | null
  expires_at: Date | null
}

/**
 * Vérifie qu'un code promo est applicable tel quel.
 *
 * Contrôlé ici et non dans le validateur : un PATCH peut ne porter que
 * `value` ou que `type`, et la règle ne se juge que sur le code une fois le
 * patch fusionné.
 */
export function assertPromoCodeCoherent(shape: PromoCodeShape): void {
  // Au-delà de 100 %, la remise dépasserait le montant du séjour et le total
  // deviendrait négatif.
  if (shape.type === 'percentage' && shape.value > 100) {
    throw new DomainError(
      'invalid_promo_value',
      'Une remise en pourcentage ne peut pas dépasser 100 %.',
      422
    )
  }

  if (shape.starts_at && shape.expires_at && shape.expires_at <= shape.starts_at) {
    throw new DomainError(
      'invalid_promo_period',
      'La date d’expiration doit suivre la date de début.',
      422
    )
  }
}
