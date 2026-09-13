import { randomUUID } from 'node:crypto'

import cloudinaryConfig from '#config/cloudinary'
import { v2 as cloudinary } from 'cloudinary'

import type { MultipartFile } from '@adonisjs/core/bodyparser'

export const ACCEPTED_IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp'] as const

export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024

export const MAX_IMAGES_PER_PROPERTY = 15

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

export async function uploadPropertyImage(file: MultipartFile, ownerId: string): Promise<string> {
  if (!file.tmpPath) {
    throw new Error('Fichier illisible : aucun contenu temporaire à envoyer.')
  }

  const result = await client().uploader.upload(file.tmpPath, {
    public_id: `${cloudinaryConfig.propertiesFolder}/${ownerId}/${randomUUID()}`,
    type: 'upload',
    resource_type: 'image',
    transformation: [{ width: 1600, height: 1600, crop: 'limit', quality: 'auto:good' }],
  })

  return result.secure_url
}

export async function deletePropertyImage(url: string | null): Promise<void> {
  const publicId = publicIdFromUrl(url)
  if (!publicId) return

  await client().uploader.destroy(publicId, {
    type: 'upload',
    resource_type: 'image',
    invalidate: true,
  })
}

export function publicIdFromUrl(url: string | null): string | null {
  if (!url) return null

  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z]{3,4}$/i)
  if (!match) return null

  const publicId = match[1]
  return publicId.startsWith(cloudinaryConfig.propertiesFolder) ? publicId : null
}
