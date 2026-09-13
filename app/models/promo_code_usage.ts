import {
  COLLECTIONS,
  collection,
  countQuery,
  toDoc,
  toDocs,
  toPayload,
  type WithId,
} from '#firebase/firestore'

export interface PromoCodeUsageDocument {
  promo_code_id: string
  user_id: string
  booking_id: string
  discount_applied: number
  created_at: Date
  updated_at: Date
}

export type PromoCodeUsageRecord = WithId<PromoCodeUsageDocument>

function usages() {
  return collection<PromoCodeUsageDocument>(COLLECTIONS.promoCodeUsages)
}

/**
 * Identifiant d'une utilisation : `"<promo_code_id>:<booking_id>"`.
 *
 * Mongo garantissait l'unicité du couple par un index composé unique. En faire
 * la clé du document reproduit cette garantie, qui protège contre le double
 * décompte d'un même code sur une même réservation lors d'un rejeu.
 */
function usageId(promoCodeId: string, bookingId: string): string {
  return `${promoCodeId}:${bookingId}`
}

/** Journal des utilisations de codes promo. */
const PromoCodeUsage = {
  async findById(id: string): Promise<PromoCodeUsageRecord | null> {
    if (!id) return null
    return toDoc<PromoCodeUsageDocument>(await usages().doc(id).get())
  },

  async create(input: {
    promo_code_id: string
    user_id: string
    booking_id: string
    discount_applied: number
  }): Promise<PromoCodeUsageRecord> {
    const now = new Date()
    const payload: PromoCodeUsageDocument = {
      promo_code_id: input.promo_code_id,
      user_id: input.user_id,
      booking_id: input.booking_id,
      discount_applied: input.discount_applied,
      created_at: now,
      updated_at: now,
    }

    const id = usageId(input.promo_code_id, input.booking_id)
    await usages()
      .doc(id)
      .set(toPayload(payload) as unknown as PromoCodeUsageDocument)

    return { ...payload, _id: id }
  },

  /**
   * Nombre d'utilisations d'un code par un utilisateur donné.
   * Sert à faire respecter `max_uses_per_user`.
   */
  async countByUser(promoCodeId: string, userId: string): Promise<number> {
    return countQuery(
      usages().where('promo_code_id', '==', promoCodeId).where('user_id', '==', userId)
    )
  },

  async findByBooking(bookingId: string): Promise<PromoCodeUsageRecord[]> {
    const snapshot = await usages().where('booking_id', '==', bookingId).get()
    return toDocs<PromoCodeUsageDocument>(snapshot.docs)
  },

  /** Supprime l'utilisation liée à une réservation annulée. */
  async deleteByPromoAndBooking(promoCodeId: string, bookingId: string): Promise<boolean> {
    const docRef = usages().doc(usageId(promoCodeId, bookingId))
    const snapshot = await docRef.get()
    if (!snapshot.exists) return false

    await docRef.delete()
    return true
  },
}

export default PromoCodeUsage
