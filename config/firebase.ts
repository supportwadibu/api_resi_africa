import env from '#start/env'

/**
 * Configuration Firebase Admin.
 *
 * Deux bases coexistent, choisies selon la nature de la donnée :
 *
 * - **Firestore** — données métier durables et requêtées (utilisateurs, rôles,
 *   sessions, biens, réservations). Requêtes composées, index explicites.
 * - **Realtime Database** — données éphémères ou temps réel (OTP, tentatives
 *   d'auth, notifications). Écritures fréquentes, purge par timestamp,
 *   latence minimale.
 *
 * Les identifiants proviennent d'un compte de service. En production on passe
 * `FIREBASE_SERVICE_ACCOUNT` (JSON complet, échappé) ; en local, poser
 * `GOOGLE_APPLICATION_CREDENTIALS` vers le fichier suffit et le SDK le lit seul.
 */

export interface FirebaseServiceAccount {
  projectId: string
  clientEmail: string
  privateKey: string
}

/**
 * Décode le compte de service depuis l'environnement.
 *
 * Retourne `null` quand la variable est absente : le SDK retombe alors sur les
 * Application Default Credentials, ce qui est le mode normal en local et sur
 * les runtimes Google.
 */
function parseServiceAccount(): FirebaseServiceAccount | null {
  const raw = env.get('FIREBASE_SERVICE_ACCOUNT')
  if (!raw) return null

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT n’est pas un JSON valide. ' +
        'Collez le contenu intégral du fichier de compte de service.'
    )
  }

  const projectId = parsed.project_id ?? parsed.projectId
  const clientEmail = parsed.client_email ?? parsed.clientEmail
  const privateKey = parsed.private_key ?? parsed.privateKey

  if (
    typeof projectId !== 'string' ||
    typeof clientEmail !== 'string' ||
    typeof privateKey !== 'string'
  ) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT incomplet : project_id, client_email et private_key sont requis.'
    )
  }

  return {
    projectId,
    clientEmail,
    // Les sauts de ligne de la clé PEM survivent rarement au passage par une
    // variable d'environnement : ils arrivent échappés en "\n" littéraux.
    privateKey: privateKey.replace(/\\n/g, '\n'),
  }
}

const firebaseConfig = {
  serviceAccount: parseServiceAccount(),

  /** Requis dès lors qu'on utilise la Realtime Database. */
  databaseURL: env.get('FIREBASE_DATABASE_URL'),

  /**
   * Renseigné uniquement si le compte de service est absent (ADC), pour que le
   * SDK sache quand même quel projet cibler.
   */
  projectId: env.get('FIREBASE_PROJECT_ID'),

  firestore: {
    /**
     * Laisse les champs `undefined` être omis au lieu de lever une erreur.
     * Sans cela, tout DTO partiel casse à l'écriture.
     */
    ignoreUndefinedProperties: true,
  },
}

export default firebaseConfig
