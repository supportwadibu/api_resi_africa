import { getMessaging } from 'firebase-admin/messaging'

import type { PushMessage, PushTransport } from '#features/notifications/push_delivery'

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
    const response = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title: message.title, body: message.body },
      data: message.data,
      android: {
        // Priorité haute : une relance d'échéance doit réveiller l'appareil,
        // pas attendre la prochaine fenêtre de maintenance d'Android.
        priority: 'high',
        notification: { sound: 'default' },
      },
      apns: { payload: { aps: { sound: 'default' } } },
    })

    return response.responses.map((r) => ({
      ok: r.success,
      errorCode: r.error?.code,
    }))
  }
}

export default FcmTransport
