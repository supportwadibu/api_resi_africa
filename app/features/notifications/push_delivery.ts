/**
 * Envoi d'une notification push à un lot d'appareils.
 *
 * Le transport — FCM en production — est injecté : le découpage en lots, le
 * dédoublonnage et le tri des jetons morts sont la partie qui peut se tromper,
 * et elle s'éprouve ainsi sans Firebase.
 */

export interface PushMessage {
  title: string
  body: string
  /** Données lues par l'application au toucher : valeurs en texte, contrainte FCM. */
  data?: Record<string, string>
}

/** Un appareil : l'identifiant de son document et son jeton FCM. */
export interface PushTarget {
  id: string
  token: string
}

export interface PushTransport {
  /** Une réponse par jeton, dans l'ordre reçu. */
  sendMulticast(
    tokens: string[],
    message: PushMessage
  ): Promise<Array<{ ok: boolean; errorCode?: string }>>
}

export interface PushDeliveryResult {
  sent: number
  failed: number
  /** Appareils dont le jeton est définitivement refusé, à supprimer. */
  invalid_ids: string[]
}

/** Plafond d'un envoi multicast FCM. */
export const FCM_MULTICAST_LIMIT = 500

/**
 * Refus qui condamnent le jeton : application désinstallée, jeton révoqué ou
 * malformé. Une panne passagère (`internal-error`, `unavailable`) ne le
 * condamne pas — le supprimer priverait l'appareil de toute notification.
 */
const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
])

export async function deliverPush(
  targets: readonly PushTarget[],
  message: PushMessage,
  transport: PushTransport,
  batchSize: number = FCM_MULTICAST_LIMIT
): Promise<PushDeliveryResult> {
  // Un même appareil peut remonter deux fois — deux comptes ciblés sur le
  // même téléphone : il ne doit recevoir la notification qu'une fois.
  const byToken = new Map<string, PushTarget>()
  for (const target of targets) byToken.set(target.token, target)
  const unique = [...byToken.values()]

  const result: PushDeliveryResult = { sent: 0, failed: 0, invalid_ids: [] }

  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize)
    const responses = await transport.sendMulticast(
      batch.map((target) => target.token),
      message
    )

    responses.forEach((response, index) => {
      if (response.ok) {
        result.sent++
        return
      }
      result.failed++
      if (response.errorCode && INVALID_TOKEN_CODES.has(response.errorCode)) {
        result.invalid_ids.push(batch[index].id)
      }
    })
  }

  return result
}
