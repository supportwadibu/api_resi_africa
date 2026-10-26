import { COLLECTIONS, collection, toDoc, toPayload } from '#firebase/firestore'

import type { PayoutNumber } from '#features/wallets/wallet_rules'

/**
 * Numéros Wave de retrait d'un propriétaire.
 *
 * Un document par propriétaire, d'identifiant son `user_id` : la demande de
 * retrait le relit sans requête ni index. Absent tant qu'aucun numéro n'a été
 * enregistré.
 */
export interface PayoutNumbersDocument {
  owner_id: string
  numbers: PayoutNumber[]
  updated_at: Date
}

function payoutNumbers() {
  return collection<PayoutNumbersDocument>(COLLECTIONS.payoutNumbers)
}

const PayoutNumbers = {
  async findByOwner(ownerId: string): Promise<PayoutNumber[]> {
    if (!ownerId) return []
    const doc = toDoc<PayoutNumbersDocument>(await payoutNumbers().doc(ownerId).get())
    return doc?.numbers ?? []
  },

  async replace(ownerId: string, numbers: PayoutNumber[]): Promise<PayoutNumber[]> {
    await payoutNumbers()
      .doc(ownerId)
      .set(
        toPayload({
          owner_id: ownerId,
          numbers,
          updated_at: new Date(),
        } satisfies PayoutNumbersDocument) as unknown as PayoutNumbersDocument
      )
    return numbers
  },
}

export default PayoutNumbers
