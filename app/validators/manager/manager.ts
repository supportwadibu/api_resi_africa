import { email, phone } from '#validators/auth/auth'
import vine from '@vinejs/vine'

/**
 * Au moins une coordonnée de connexion.
 *
 * Sans e-mail ni téléphone, le gérant n'aurait aucun moyen de se connecter :
 * `auth_channel` désigne l'un ou l'autre, et le compte serait créé inutilisable.
 * La règle porte sur l'objet entier — aucun des deux champs pris isolément ne
 * peut juger de la présence de l'autre.
 */
const hasLoginContact = vine.createRule((value, _options, field) => {
  const payload = value as { email?: unknown; phone?: unknown }

  // Noms distincts des helpers `email()` / `phone()` importés, qu'ils
  // masqueraient autrement dans cette portée.
  const emailValue = typeof payload?.email === 'string' ? payload.email.trim() : ''
  const phoneValue = typeof payload?.phone === 'string' ? payload.phone.trim() : ''

  if (emailValue || phoneValue) return

  field.report(
    'Renseignez au moins un e-mail ou un numéro de téléphone.',
    'managerContactRequired',
    field
  )
})

export const createManagerValidator = vine.compile(
  vine
    .object({
      full_name: vine.string().trim().minLength(2).maxLength(120),
      // Helpers d'`auth.ts` : le gérant se connecte par le flux de connexion
      // ordinaire, qui interroge par égalité stricte. Une adresse non abaissée
      // ou un numéro à espaces livreraient un compte impossible à utiliser, et
      // franchiraient le contrôle d'unicité d'un compte déjà existant — fût-il
      // celui d'un propriétaire ou d'un admin.
      email: email().optional(),
      phone: phone().optional(),
      // 72 octets : borne de bcrypt, au-delà de laquelle la fin du mot de passe
      // est ignorée silencieusement.
      password: vine.string().minLength(8).maxLength(72),
      property_ids: vine.array(vine.string().trim()).distinct(),
    })
    .use(hasLoginContact())
)

/** Renommage et coordonnées. Le mot de passe relève du profil du gérant. */
export const updateManagerValidator = vine.compile(
  vine.object({
    full_name: vine.string().trim().minLength(2).maxLength(120).optional(),
    // Mêmes helpers qu'à la création : une coordonnée modifiée sans
    // normalisation rendrait tout aussi bien le compte inutilisable.
    email: email().nullable().optional(),
    phone: phone().nullable().optional(),
  })
)

/**
 * Liste complète du périmètre voulu — le verbe est `PUT`, pas `PATCH`.
 * Un tableau vide est valide : il retire tous les logements du gérant.
 */
export const updateManagerPropertiesValidator = vine.compile(
  vine.object({
    property_ids: vine.array(vine.string().trim()).distinct(),
  })
)

export const setManagerStatusValidator = vine.compile(
  vine.object({
    is_active: vine.boolean(),
  })
)

/**
 * PATCH /gerant/profile
 *
 * Nom et mot de passe, rien d'autre. E-mail et téléphone en sont absents : ce
 * sont les identifiants de connexion par lesquels le propriétaire retrouve le
 * compte qu'il a ouvert, et les laisser réécrire au gérant lui permettrait d'y
 * soustraire son compte.
 *
 * `current_password` est exigé par le use case dès qu'un nouveau mot de passe
 * est soumis : sans ce contrôle, un jeton volé suffirait à verrouiller le
 * compte.
 */
export const updateManagerProfileValidator = vine.compile(
  vine.object({
    full_name: vine.string().trim().minLength(2).maxLength(120).optional(),
    current_password: vine.string().minLength(8).maxLength(72).optional(),
    // 72 octets : borne de bcrypt, au-delà de laquelle la fin du mot de passe
    // est ignorée silencieusement.
    new_password: vine.string().minLength(8).maxLength(72).optional(),
  })
)
