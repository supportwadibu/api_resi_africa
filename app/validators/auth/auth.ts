import vine from '@vinejs/vine'

/**
 * Coordonnées de connexion, normalisées à l'entrée.
 *
 * Exportées : tout flux créant un compte doit les réutiliser. Les recherches
 * d'unicité comme l'authentification interrogent Firestore par égalité stricte,
 * si bien qu'une adresse non abaissée en minuscules produirait un compte qui ne
 * peut pas se connecter *et* passerait à travers le contrôle d'unicité d'un
 * compte existant.
 */
export const email = () => vine.string().trim().email().toLowerCase().maxLength(254)
export const phone = () =>
  vine
    .string()
    .trim()
    .regex(/^\+?[0-9]{7,15}$/)
const password = () => vine.string().minLength(8).maxLength(64)

/**
 * POST /auth/register/init
 * Crée un compte non vérifié et envoie un OTP.
 */
export const registerInitValidator = vine.compile(
  vine.object({
    full_name: vine.string().trim().minLength(2).maxLength(120),
    auth_channel: vine.enum(['email', 'phone'] as const),
    email: email().nullable().optional(),
    phone: phone().nullable().optional(),
    password: password(),
    password_confirmation: password().sameAs('password'),
    role_name: vine.enum(['admin', 'proprio', 'client'] as const),
  })
)

/**
 * POST /auth/register/verify
 */
export const registerVerifyValidator = vine.compile(
  vine.object({
    channel: vine.enum(['email', 'phone'] as const),
    target: vine.string().trim().minLength(3).maxLength(254),
    code: vine.string().trim().fixedLength(6),
  })
)

/**
 * POST /auth/login
 */
export const loginValidator = vine.compile(
  vine.object({
    identifier: vine.string().trim().minLength(3).maxLength(254),
    password: vine.string().minLength(1),
  })
)

/**
 * POST /auth/google
 * `id_token` est un JWT Google — la longueur minimale écarte les envois vides
 * ou tronqués avant même l'appel de vérification.
 */
export const googleLoginValidator = vine.compile(
  vine.object({
    id_token: vine.string().trim().minLength(20).maxLength(4096),
  })
)

/**
 * POST /auth/refresh
 */
export const refreshValidator = vine.compile(
  vine.object({
    refresh_token: vine.string().trim().minLength(10),
  })
)

/**
 * POST /auth/logout
 */
export const logoutValidator = vine.compile(
  vine.object({
    refresh_token: vine.string().trim().minLength(10),
  })
)
