import cloudinaryConfig from '#config/cloudinary'
import { v2 as cloudinary } from 'cloudinary'

import type { MultipartFile } from '@adonisjs/core/bodyparser'

/**
 * Stockage des justificatifs déposés par les utilisateurs.
 *
 * Les pièces d'identité sont **privées** : elles sont envoyées en mode
 * `authenticated`, ce qui les rend inaccessibles par URL publique même à qui
 * en devinerait le chemin. La lecture passe exclusivement par des URLs signées
 * à durée limitée, régénérées à chaque consultation.
 *
 * L'implémentation est confinée ici : les use cases manipulent des
 * identifiants opaques (`publicId`) sans connaître l'hébergeur.
 */

/** Durée de validité d'une URL signée. Assez pour afficher, trop peu pour circuler. */
const SIGNED_URL_TTL_MS = 15 * 60 * 1000

/** Formats d'image acceptés pour un justificatif. */
export const ACCEPTED_DOCUMENT_FORMATS = ['jpg', 'jpeg', 'png', 'webp'] as const

/** Le SDK est configuré à la première utilisation, jamais au chargement du module. */
let configured = false

function client() {
  if (!configured) {
    const { cloudName, apiKey, apiSecret } = cloudinaryConfig

    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error(
        'Cloudinary n’est pas configuré : renseignez CLOUDINARY_CLOUD_NAME, ' +
          'CLOUDINARY_API_KEY et CLOUDINARY_API_SECRET.'
      )
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    })
    configured = true
  }

  return cloudinary
}

/**
 * Envoie un justificatif et retourne son identifiant Cloudinary.
 *
 * C'est le `public_id` qui est persisté, jamais une URL : une URL signée
 * expire, la stocker produirait des liens morts au premier affichage différé.
 *
 * Le nom de destination est imposé par l'appelant plutôt que dérivé du nom
 * d'origine : un nom de fichier fourni par le client est une entrée non fiable
 * (traversée de chemin, collision, caractères hostiles).
 */
export async function uploadDocument(file: MultipartFile, destination: string): Promise<string> {
  if (!file.tmpPath) {
    throw new Error('Fichier illisible : aucun contenu temporaire à envoyer.')
  }

  const result = await client().uploader.upload(file.tmpPath, {
    public_id: `${cloudinaryConfig.documentsFolder}/${destination}`,
    // `authenticated` interdit tout accès sans signature, là où `upload`
    // (le mode par défaut) rendrait la pièce d'identité publique.
    type: 'authenticated',
    resource_type: 'image',
    // Un dépôt correctif doit remplacer le précédent : sans cela Cloudinary
    // refuserait le `public_id` déjà pris.
    overwrite: true,
    invalidate: true,
  })

  return result.public_id
}

/**
 * URL de lecture temporaire pour un justificatif privé.
 *
 * Retourne `null` si l'identifiant est vide, ce qui laisse les appelants
 * construire un DTO sans multiplier les gardes.
 */
export function signedDocumentUrl(
  publicId: string | null,
  ttlMs: number = SIGNED_URL_TTL_MS
): string | null {
  if (!publicId) return null

  return client().url(publicId, {
    type: 'authenticated',
    resource_type: 'image',
    secure: true,
    sign_url: true,
    expires_at: Math.floor((Date.now() + ttlMs) / 1000),
  })
}

/**
 * Supprime un justificatif, sans échouer s'il a déjà disparu.
 *
 * Sert au remplacement d'une pièce : l'ancien fichier n'a plus de raison
 * d'occuper l'espace, mais son absence n'est pas une erreur métier.
 */
export async function deleteDocument(publicId: string | null): Promise<void> {
  if (!publicId) return

  await client().uploader.destroy(publicId, {
    type: 'authenticated',
    resource_type: 'image',
    invalidate: true,
  })
}
