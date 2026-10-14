import {
  ACCEPTED_IMAGE_FORMATS,
  MAX_IMAGE_SIZE_BYTES,
  MAX_IMAGES_PER_PROPERTY,
  uploadPropertyImage,
} from '#services/property_image_storage'

import type { HttpContext } from '@adonisjs/core/http'

export default class ProprioPropertyImageController {
  async store(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const files = ctx.request.files('images', {
      size: MAX_IMAGE_SIZE_BYTES,
      extnames: [...ACCEPTED_IMAGE_FORMATS],
    })

    if (files.length === 0) {
      return ctx.response.unprocessableEntity({
        error: 'Aucune image reçue.',
      })
    }

    if (files.length > MAX_IMAGES_PER_PROPERTY) {
      return ctx.response.unprocessableEntity({
        error: `Pas plus de ${MAX_IMAGES_PER_PROPERTY} photos par annonce.`,
      })
    }

    const invalid = files.find((file) => !file.isValid)
    if (invalid) {
      return ctx.response.unprocessableEntity({
        error: invalid.errors[0]?.message ?? 'Image invalide.',
      })
    }

    const urls: string[] = []
    for (const file of files) {
      urls.push(await uploadPropertyImage(file, userId))
    }

    return ctx.response.created({ data: { images: urls } })
  }
}
