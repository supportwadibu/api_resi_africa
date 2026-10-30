import {
  COLLECTIONS,
  collection,
  toDoc,
  toPayload,
  transaction,
  type WithId,
} from '#firebase/firestore'

import {
  availableSteps,
  negotiationExpiry,
  negotiationId,
  nextStep,
  type NegotiationSettings,
  type NextStepResult,
} from '#features/negotiations/negotiation_rules'
import type { PropertyDocument } from '#models/property'

/**
 * Négociation d'un client sur un bien : les paliers qui lui ont été révélés.
 *
 * Un document par couple bien–client, d'identifiant dérivé
 * (`negotiationId`) : deux appuis simultanés sur « Négocier encore » tombent
 * sur le même document, la transaction les ordonne, et aucun palier n'est
 * sauté.
 */
export interface NegotiationDocument {
  property_id: string
  client_id: string
  owner_id: string
  /** Prix par jour révélés, dans l'ordre. Figés : voir `nextStep`. */
  offers: number[]
  expires_at: Date
  created_at: Date
  updated_at: Date
}

export type NegotiationRecord = WithId<NegotiationDocument>

function negotiations() {
  return collection<NegotiationDocument>(COLLECTIONS.negotiations)
}

function properties() {
  return collection<PropertyDocument>(COLLECTIONS.properties)
}

/** Paliers encore valables : une négociation échue repart de zéro. */
function liveOffers(doc: NegotiationDocument | null, now: Date): number[] {
  if (!doc || doc.expires_at.getTime() <= now.getTime()) return []
  return doc.offers ?? []
}

const Negotiation = {
  /** Paliers révélés et encore valables, vides s'il n'y en a pas. */
  async offers(propertyId: string, clientId: string, now: Date): Promise<number[]> {
    const doc = toDoc<NegotiationDocument>(
      await negotiations().doc(negotiationId(propertyId, clientId)).get()
    )
    return liveOffers(doc, now)
  },

  /**
   * Révèle le palier suivant. `null` si le bien est introuvable.
   *
   * La validité court à nouveau à chaque palier révélé : le client qui
   * négocie est en train de choisir.
   */
  async revealNext(
    propertyId: string,
    clientId: string,
    now: Date
  ): Promise<{ result: NextStepResult; daily_price: number } | null> {
    const propertyRef = properties().doc(propertyId)
    const ref = negotiations().doc(negotiationId(propertyId, clientId))

    return transaction(async (tx) => {
      const [propertySnap, snap] = await Promise.all([tx.get(propertyRef), tx.get(ref)])
      const property = toDoc<PropertyDocument>(propertySnap)
      if (!property) return null

      const dailyPrice = property.pricing?.daily_price ?? 0
      const current = toDoc<NegotiationDocument>(snap)
      const result = nextStep(
        liveOffers(current, now),
        availableSteps(property.negotiation as NegotiationSettings | undefined, dailyPrice)
      )

      if (result.status === 'offer') {
        const doc: NegotiationDocument = {
          property_id: propertyId,
          client_id: clientId,
          owner_id: property.owner_id,
          offers: result.offers,
          expires_at: negotiationExpiry(now),
          created_at: current && result.offers.length > 1 ? current.created_at : now,
          updated_at: now,
        }
        tx.set(ref, toPayload(doc) as unknown as NegotiationDocument)
      }

      return { result, daily_price: dailyPrice }
    })
  },
}

export default Negotiation
