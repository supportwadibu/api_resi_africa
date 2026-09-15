import cloudinaryConfig from '#config/cloudinary'
import { v2 as cloudinary } from 'cloudinary'

/**
 * Stockage des rapports PDF édités par les propriétaires.
 *
 * Les rapports sont **privés** : ils portent le chiffre d'affaires d'un
 * propriétaire et les coordonnées de ses clients. Comme les pièces d'identité
 * de `document_storage`, ils partent en `authenticated` et ne sont lisibles
 * que par une URL signée à durée limitée.
 */

/**
 * Durée de validité du lien. Assez pour ouvrir le document ou le partager
 * dans la foulée, trop peu pour qu'il circule durablement.
 */
const SIGNED_URL_TTL_MS = 15 * 60 * 1000

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

export interface StoredReport {
  url: string
  expires_at: Date
  public_id: string
}

export async function uploadReport(pdf: Buffer, filename: string): Promise<StoredReport> {
  const publicId = `${cloudinaryConfig.reportsFolder}/${filename}`

  const uploaded = await new Promise<{ public_id: string }>((resolve, reject) => {
    const stream = client().uploader.upload_stream(
      {
        public_id: publicId,
        type: 'authenticated',
        // `raw` et non `image` : un PDF passé en `image` serait converti en
        // aperçu par Cloudinary, et le document téléchargé ne serait plus
        // celui qu'on a produit.
        resource_type: 'raw',
        overwrite: true,
      },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Envoi du rapport échoué.'))
        resolve(result)
      }
    )

    stream.end(pdf)
  })

  const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_MS)

  const url = client().url(uploaded.public_id, {
    type: 'authenticated',
    resource_type: 'raw',
    sign_url: true,
    secure: true,
    expires_at: Math.floor(expiresAt.getTime() / 1000),
  })

  return { url, expires_at: expiresAt, public_id: uploaded.public_id }
}
