import { ROLE_NAMES } from '#models/role'
import { email, phone } from '#validators/auth/auth'

import vine from '@vinejs/vine'

/** GET /admin/users */
export const listUsersValidator = vine.compile(
  vine.object({
    role: vine.enum(ROLE_NAMES).optional(),
    is_active: vine.boolean().optional(),
    q: vine.string().trim().maxLength(120).optional(),
    page: vine.number().positive().withoutDecimals().optional(),
    per_page: vine.number().positive().withoutDecimals().max(100).optional(),
  })
)

/**
 * PATCH /admin/users/:id
 *
 * E-mail et téléphone passent par les mêmes règles qu'à l'inscription : une
 * adresse non abaissée en minuscules produirait un compte qui ne peut plus se
 * connecter. Ni l'un ni l'autre n'est effaçable — c'est l'identifiant de
 * connexion du compte.
 */
export const updateUserValidator = vine.compile(
  vine.object({
    full_name: vine.string().trim().minLength(2).maxLength(120).optional(),
    email: email().optional(),
    phone: phone().optional(),
    is_active: vine.boolean().optional(),
  })
)
