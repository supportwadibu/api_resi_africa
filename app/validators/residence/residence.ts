import vine from '@vinejs/vine'

const addressSchema = vine.object({
  street: vine.string().trim().minLength(2).maxLength(255),
  city: vine.string().trim().minLength(2).maxLength(120),
  country: vine.string().trim().maxLength(120).optional(),
  postal_code: vine.string().trim().maxLength(20).optional(),
  coordinates: vine
    .object({
      latitude: vine.number().min(-90).max(90).optional(),
      longitude: vine.number().min(-180).max(180).optional(),
    })
    .optional(),
})

/**
 * Équipements des parties communes.
 *
 * Plus court que celui d'un bien : seuls les équipements du lieu figurent ici,
 * la climatisation ou le balcon variant d'une unité à l'autre.
 */
const amenitiesSchema = vine
  .object({
    pool: vine.boolean().optional(),
    gym: vine.boolean().optional(),
    security: vine.boolean().optional(),
    concierge: vine.boolean().optional(),
    elevator: vine.boolean().optional(),
    parking: vine.boolean().optional(),
    garden: vine.boolean().optional(),
    wifi: vine.boolean().optional(),
  })
  .optional()

const mediaSchema = vine
  .object({
    images: vine.array(vine.string().url()).optional(),
    videos: vine.array(vine.string().url()).optional(),
  })
  .optional()

/**
 * POST /proprio/residences
 */
export const createResidenceValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(2).maxLength(150),
    description: vine.string().trim().maxLength(5000).optional(),
    address: addressSchema,
    media: mediaSchema,
    amenities: amenitiesSchema,
  })
)

/**
 * PATCH /proprio/residences/:id
 */
export const updateResidenceValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(2).maxLength(150).optional(),
    description: vine.string().trim().maxLength(5000).optional(),
    address: addressSchema.optional(),
    media: mediaSchema,
    amenities: amenitiesSchema,
  })
)

/**
 * GET /proprio/residences
 */
export const listResidencesValidator = vine.compile(
  vine.object({
    page: vine.number().positive().withoutDecimals().optional(),
    per_page: vine.number().positive().withoutDecimals().max(100).optional(),
  })
)

/**
 * PATCH /proprio/properties/:id/residence
 *
 * `residence_id` nullable : la même route détache l'unité en recevant `null`.
 * `copy_address` est explicite — recopier l'adresse en silence changerait ce
 * qu'affiche une annonce déjà publiée.
 */
export const attachResidenceValidator = vine.compile(
  vine.object({
    residence_id: vine.string().trim().minLength(1).nullable(),
    unit_label: vine.string().trim().maxLength(120).nullable().optional(),
    copy_address: vine.boolean().optional(),
  })
)

/** GET /admin/residences */
export const listPlatformResidencesValidator = vine.compile(
  vine.object({
    owner_id: vine.string().trim().minLength(1).optional(),
    page: vine.number().positive().withoutDecimals().optional(),
    per_page: vine.number().positive().withoutDecimals().max(100).optional(),
  })
)
