import { ROLE_NAMES } from '#models/role'
import { email, password, phone } from '#validators/auth/auth'

import vine from '@vinejs/vine'

/** GET /admin/users */
export const listUsersValidator = vine.compile(
  vine.object({
    role: vine.enum(ROLE_NAMES).optional(),
    is_active: vine.boolean().optional(),
    is_verified: vine.boolean().optional(),
    // `accepted` : seul « comptes supprimés » se filtre, voir `User.paginate`.
    deleted: vine.accepted().optional(),
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

/**
 * POST /admin/users
 *
 * Au moins un identifiant de connexion, e-mail ou téléphone. Les règles
 * propres à un rôle (e-mail d'un admin, propriétaire d'un gérant) sont
 * reprises par le use case, dernière garde avant l'écriture.
 */
export const createUserValidator = vine.compile(
  vine.object({
    role: vine.enum(ROLE_NAMES),
    full_name: vine.string().trim().minLength(2).maxLength(120),
    email: email().optional().requiredIfMissing('phone'),
    phone: phone().optional(),
    password: password(),
    owner_id: vine.string().trim().optional().requiredWhen('role', '=', 'gerant'),
  })
)

/**
 * Création d'un administrateur depuis la ligne de commande (`admin:create`).
 *
 * L'e-mail est exigé : c'est l'identifiant de connexion au back-office. Mêmes
 * règles qu'à l'inscription (voir `auth.ts`) : la connexion interroge par
 * égalité stricte, une adresse non abaissée donnerait un compte inutilisable.
 */
export const createAdminValidator = vine.compile(
  vine.object({
    full_name: vine.string().trim().minLength(2).maxLength(120),
    email: email(),
    phone: phone().optional(),
    password: password(),
  })
)

/**
 * PATCH /admin/profile — compte de l'administrateur connecté.
 *
 * `phone: null` retire le numéro ; l'e-mail ne se retire pas, c'est
 * l'identifiant de connexion au back-office. `current_password` : bornes de
 * la connexion, pas de l'inscription — un mot de passe ancien peut être plus
 * court que les règles d'aujourd'hui.
 */
export const updateAdminProfileValidator = vine.compile(
  vine.object({
    full_name: vine.string().trim().minLength(2).maxLength(120).optional(),
    email: email().optional(),
    phone: phone().nullable().optional(),
    current_password: vine.string().minLength(1).maxLength(128).optional(),
    new_password: password().optional(),
  })
)
