import firebaseConfig from '#config/firebase'
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'
import { getFirestore } from 'firebase-admin/firestore'

import type { ApplicationService } from '@adonisjs/core/types'

export default class FirebaseProvider {
  constructor(protected app: ApplicationService) {}

  async boot() {
    const logger = await this.app.container.make('logger')

    if (getApps().length > 0) {
      return
    }

    try {
      const { serviceAccount, databaseURL, projectId } = firebaseConfig

      initializeApp({
        credential: serviceAccount
          ? cert({
              projectId: serviceAccount.projectId,
              clientEmail: serviceAccount.clientEmail,
              privateKey: serviceAccount.privateKey,
            })
          : // Aucun compte de service fourni : on s'appuie sur les Application
            // Default Credentials (GOOGLE_APPLICATION_CREDENTIALS en local,
            // identité du runtime sur GCP).
            applicationDefault(),
        projectId: serviceAccount?.projectId ?? projectId,
        databaseURL,
      })

      getFirestore().settings(firebaseConfig.firestore)

      logger.info(
        { projectId: serviceAccount?.projectId ?? projectId },
        'Firebase Admin initialisé'
      )
    } catch (error) {
      logger.error({ err: error }, "Échec de l'initialisation de Firebase Admin")
      throw error
    }
  }

  async shutdown() {
    if (getApps().length > 0 && firebaseConfig.databaseURL) {
      getDatabase().goOffline()
    }
  }
}
