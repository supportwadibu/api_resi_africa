import { getMessaging, type MulticastMessage } from 'firebase-admin/messaging'

import type { PushMessage, PushTransport } from '#features/notifications/push_delivery'

/**
 * Canal Android des notifications, créé par l'application au démarrage avec
 * une importance haute (bannière et son).
 *
 * Sans canal nommé, Android range la notification dans le canal de secours de
 * FCM, d'importance normale : une simple icône dans la barre d'état, que le
 * propriétaire ne remarque pas. Le nom doit rester celui de
 * `PushNotificationService.channelId` côté mobile.
 */
export const RESI_ANDROID_CHANNEL = 'resi_default'

/**
 * Message multicast, composé à part pour être éprouvé sans Firebase : c'est
 * lui qui décide si la notification se voit sur le téléphone.
 */
export function buildFcmMessage(tokens: string[], message: PushMessage): MulticastMessage {
  return {
    tokens,
    notification: { title: message.title, body: message.body },
    data: message.data,
    android: {
      // Priorité haute : une relance d'échéance doit réveiller l'appareil,
      // pas attendre la prochaine fenêtre de maintenance d'Android.
      priority: 'high',
      notification: { channelId: RESI_ANDROID_CHANNEL, sound: 'default' },
    },
    apns: { payload: { aps: { sound: 'default' } } },
  }
}

/**
 * Transport FCM, confiné ici comme `pdf_renderer` confine Puppeteer.
 *
 * Il réutilise l'application Firebase déjà initialisée pour Firestore : le
 * compte de service couvre aussi Cloud Messaging, aucun secret de plus.
 */
export class FcmTransport implements PushTransport {
  async sendMulticast(
    tokens: string[],
    message: PushMessage
  ): Promise<Array<{ ok: boolean; errorCode?: string }>> {
    const response = await getMessaging().sendEachForMulticast(buildFcmMessage(tokens, message))

    return response.responses.map((r) => ({
      ok: r.success,
      errorCode: r.error?.code,
    }))
  }
}

export default FcmTransport
