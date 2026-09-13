import vine from '@vinejs/vine'

const name = () => vine.string().trim().minLength(5).maxLength(80)
const description = () => vine.string().trim().maxLength(1000)
const price = () => vine.number().positive()
const durationDays = () => vine.number().positive().withoutDecimals()
const maxResidences = () => vine.number().positive().withoutDecimals()
const features = () => vine.array(vine.string().trim().minLength(1).maxLength(80)).maxLength(50)

/**
 * POST /admin/plans
 */
export const createPlanValidator = vine.compile(
  vine.object({
    name: name(),
    description: description().optional(),
    price: price(),
    duration_days: durationDays(),
    max_residences: maxResidences(),
    features: features().optional(),
    is_active: vine.boolean().optional(),
  })
)

/**
 * PATCH /admin/plans/:id
 */
export const updatePlanValidator = vine.compile(
  vine.object({
    name: name().optional(),
    description: description().optional(),
    price: price().optional(),
    duration_days: durationDays().optional(),
    max_residences: maxResidences().optional(),
    features: features().optional(),
    is_active: vine.boolean().optional(),
  })
)

/**
 * GET /admin/plans
 */
export const listPlansValidator = vine.compile(
  vine.object({
    is_active: vine.boolean().optional(),
    page: vine.number().positive().withoutDecimals().optional(),
    per_page: vine.number().positive().withoutDecimals().max(100).optional(),
  })
)
