import firebaseConfig from '#config/firebase'
import { getDatabase } from 'firebase-admin/database'

import type { Database, Reference } from 'firebase-admin/database'

/**
 * Accès à la Realtime Database.
 *
 * Réservée aux données que Firestore servirait mal :
 *
 * - **Éphémères à forte rotation** — OTP, tentatives d'authentification. Leur
 *   durée de vie se compte en minutes ; les facturer comme des écritures
 *   Firestore et les indexer n'aurait pas de sens.
 * - **Temps réel** — notifications, compteurs de non-lus. Les listeners RTDB
 *   sont plus légers et la latence bien inférieure.
 *
 * RTDB stocke les dates en millisecondes epoch : pas de type date natif. La
 * conversion se fait donc au bord, dans les repositories.
 */

/**
 * Note sur `database.rules.json` — le format n'accepte aucune clé de
 * commentaire, la documentation des règles vit donc ici :
 *
 * L'API écrit via un compte de service, qui contourne les règles de sécurité.
 * Celles-ci ne régissent que les accès directs depuis un client.
 *
 * Les conditions `auth.uid` sur `notifications`, `unread_counts` et `presence`
 * supposent un utilisateur Firebase Auth. Or l'authentification est assurée par
 * l'API avec ses propres JWT : les clients n'ont pas d'identité Firebase, et
 * ces branches refusent donc tout accès en l'état. Ouvrir l'écoute temps réel
 * depuis Flutter demandera que l'API émette un jeton personnalisé
 * (`createCustomToken`) portant l'identifiant utilisateur comme uid.
 *
 * `otp_codes` et `auth_attempts` restent fermés en toutes circonstances : un
 * accès client y exposerait les hashs de codes et la surface de rejeu.
 */

/** Racines RTDB, centralisées pour éviter les chemins en dur. */
export const RTDB_PATHS = {
  otpCodes: 'otp_codes',
  authAttempts: 'auth_attempts',
  notifications: 'notifications',
  unreadCounts: 'unread_counts',
  presence: 'presence',
} as const

export type RtdbPath = (typeof RTDB_PATHS)[keyof typeof RTDB_PATHS]

export function rtdb(): Database {
  if (!firebaseConfig.databaseURL) {
    throw new Error(
      'FIREBASE_DATABASE_URL non renseignée : la Realtime Database est requise pour ' +
        'les OTP et les tentatives d’authentification. Créez une instance dans la ' +
        'console Firebase, puis reportez son URL dans l’environnement.'
    )
  }
  return getDatabase()
}

export function ref(path: string): Reference {
  return rtdb().ref(path)
}

/**
 * Segment de chemin sûr.
 *
 * Les clés RTDB interdisent `. $ # [ ] /` et les caractères de contrôle. Or on
 * indexe par e-mail ou téléphone (le `target` du rate-limit), qui contiennent
 * presque toujours un point. Sans encodage, l'écriture échoue ou crée une
 * arborescence parasite.
 */
export function encodeKey(value: string): string {
  return encodeURIComponent(value).replace(/\./g, '%2E')
}

/** Objet applicatif issu de RTDB : la clé du nœud est exposée sous `_id`. */
export type RtdbRecord<T> = T & { _id: string }

/**
 * Transforme un instantané en liste d'objets.
 *
 * RTDB renvoie une map `{ clé: valeur }`, jamais un tableau — l'ordre n'est
 * donc pas garanti et doit être rétabli par l'appelant si besoin.
 */
export function toRecords<T>(value: unknown): Array<RtdbRecord<T>> {
  if (!value || typeof value !== 'object') return []

  return Object.entries(value as Record<string, T>).map(([key, item]) => ({
    ...(item as T),
    _id: key,
  }))
}
