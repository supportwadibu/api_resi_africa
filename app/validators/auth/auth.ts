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
export const password = () => vine.string().minLength(8).maxLength(64)

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
    // `admin` absent à dessein : la route est publique, et l'accepter laissait
    // n'importe qui se créer un compte administrateur. Les administrateurs
    // naissent de `BOOTSTRAP_ADMINS` ou de `node ace admin:create`.
    role_name: vine.enum(['proprio', 'client'] as const),
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
    // Code du parrain, saisi au formulaire d'inscription. Lu à la validation
    // de l'OTP et non à l'envoi : un compte jamais vérifié n'est le filleul
    // de personne.
    sponsorship_code: vine.string().trim().maxLength(20).optional(),
  })
)

/**
 * POST /auth/register/resend
 * Mêmes `channel` et `target` que la vérification : l'écran de saisie du
 * code les détient déjà, sans avoir à garder le mot de passe.
 */
export const registerResendValidator = vine.compile(
  vine.object({
    channel: vine.enum(['email', 'phone'] as const),
    target: vine.string().trim().minLength(3).maxLength(254),
  })
)

/**
 * POST /auth/login
 */
export const loginValidator = vine.compile(
  vine.object({
    // Un e-mail est abaissé comme à l'inscription : la recherche se fait par
    // égalité stricte, et « Awa@… » ne trouverait pas le compte « awa@… ».
    identifier: vine
      .string()
      .trim()
      .minLength(3)
      .maxLength(254)
      .transform((value) => (value.includes('@') ? value.toLowerCase() : value)),
    // Borne haute : bcrypt ne lit que 72 octets, et rien ne justifie de
    // recevoir davantage.
    password: vine.string().minLength(1).maxLength(128),
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
    // Lu à la création du compte seulement : un compte existant garde son
    // rôle, sinon une connexion depuis l'app client changerait un
    // propriétaire en client. Absent pour l'application propriétaire.
    role_name: vine.enum(['proprio', 'client'] as const).optional(),
    // Code du parrain, lu à la création du compte seulement.
    sponsorship_code: vine.string().trim().maxLength(20).optional(),
  })
)

/**
 * POST /auth/refresh
 */
export const refreshValidator = vine.compile(
  vine.object({
    refresh_token: vine.string().trim().minLength(10).maxLength(2048),
  })
)

/**
 * POST /auth/logout
 */
export const logoutValidator = vine.compile(
  vine.object({
    refresh_token: vine.string().trim().minLength(10).maxLength(2048),
  })
)
