import env from '#start/env'

const cloudinaryConfig = {
  cloudName: env.get('CLOUDINARY_CLOUD_NAME'),
  apiKey: env.get('CLOUDINARY_API_KEY'),
  apiSecret: env.get('CLOUDINARY_API_SECRET'),

  documentsFolder: env.get('CLOUDINARY_DOCUMENTS_FOLDER', 'resi/owner-documents'),

  propertiesFolder: env.get('CLOUDINARY_PROPERTIES_FOLDER', 'resi/properties'),
}

export default cloudinaryConfig
