import PromoCode from '#models/promo_code'
import PromoCodeUsage from '#models/promo_code_usage'

export interface AppliedPromoCode {
  id: string
  code: string
  discount: number
}

export class PromoCodeRepository {
  /**
   * Valide un code promo et calcule la remise.
   *
   * Mongo exprimait les conditions de validité dans le filtre de `findOne`
   * (`$and` de `$or`, avec un `$expr` comparant `uses_count` à `max_uses`).
   * Firestore ne sait ni composer des OU sur des champs distincts ni comparer
   * deux champs entre eux : le code est donc lu par sa clé — un accès direct,
   * sans requête — puis chaque condition est vérifiée explicitement.
   *
   * Le résultat est identique, et les motifs d'échec deviennent distinguables :
   * là où Mongo renvoyait un `invalid_promo_code` indifférencié, on peut dire
   * si le code est expiré ou épuisé.
   */
  async validate(code: string, user_id: string, subtotal: number): Promise<AppliedPromoCode> {
    const promo = await PromoCode.findByCode(code)

    if (!promo || !promo.is_active) {
      throw new Error('invalid_promo_code')
    }

    const now = new Date()

    if (promo.starts_at !== null && promo.starts_at.getTime() > now.getTime()) {
      throw new Error('invalid_promo_code')
    }

    if (promo.expires_at !== null && promo.expires_at.getTime() < now.getTime()) {
      throw new Error('invalid_promo_code')
    }

    if (promo.max_uses !== null && promo.uses_count >= promo.max_uses) {
      throw new Error('promo_usage_limit_reached')
    }

    if (promo.min_amount !== null && subtotal < promo.min_amount) {
      throw new Error('promo_min_amount_not_reached')
    }

    const usageCount = await PromoCodeUsage.countByUser(promo._id, user_id)
    if (usageCount >= promo.max_uses_per_user) {
      throw new Error('promo_user_limit_reached')
    }

    const rawDiscount =
      promo.type === 'percentage' ? Math.round((subtotal * promo.value) / 100) : promo.value

    return {
      id: promo._id,
      code: promo.code,
      discount: Math.min(rawDiscount, subtotal),
    }
  }

  /**
   * Réserve une utilisation hors transaction de réservation.
   *
   * Le flux de création d'une réservation ne passe pas par ici : il inscrit
   * l'incrément et l'usage dans sa propre transaction, pour que le bien, la
   * réservation et le code promo basculent d'un seul tenant
   * (`Booking.createWithPropertyReservation`).
   *
   * @throws `promo_usage_limit_reached` si le quota est atteint
   */
  async reserveUsage(
    promo_code_id: string,
    user_id: string,
    booking_id: string,
    discount_applied: number
  ): Promise<void> {
    await PromoCode.reserveUse(promo_code_id)

    try {
      await PromoCodeUsage.create({
        promo_code_id,
        user_id,
        booking_id,
        discount_applied,
      })
    } catch (error) {
      // Le compteur a été incrémenté mais l'usage n'a pas pu être tracé :
      // on le relâche pour ne pas consommer un quota sans contrepartie.
      await PromoCode.releaseUse(promo_code_id)
      throw error
    }
  }
}

export default PromoCodeRepository
