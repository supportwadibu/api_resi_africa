import Role from '#models/role'
import type { SecretKind } from '#models/user'
import { AuthError } from '#utils/auth_error'

/**
 * Secret de connexion selon le rôle.
 *
 * Un client se connecte avec un code à 4 chiffres, comme dans Wave : c'est le
 * geste que les clients de RESI connaissent. Propriétaires, gérants et
 * administrateurs gardent un mot de passe — leur compte encaisse de l'argent
 * et gère des tiers.
 *
 * Un code à 4 chiffres n'a que 10 000 valeurs : il ne tient que par le
 * blocage du compte après `MAX_PIN_ATTEMPTS` codes faux d'affilée, levé
 * seulement par un code de réinitialisation envoyé au titulaire.
 */

export const PIN_LENGTH = 4
export const MAX_PIN_ATTEMPTS = 5
export const MIN_PASSWORD_LENGTH = 8

const PIN_PATTERN = /^\d{4}$/
const DIGITS = '0123456789'

/** Le rôle se connecte-t-il avec un code plutôt qu'un mot de passe ? */
export function secretKindFor(roleName: string): SecretKind {
  return roleName === 'client' ? 'pin' : 'password'
}

/**
 * Code trop facile à deviner : chiffres identiques (0000, 7777) ou suite
 * (1234, 9876). Ce sont les premiers qu'essaie quiconque devine, et cinq
 * essais suffiraient alors.
 */
export function isWeakPin(pin: string): boolean {
  if (new Set(pin).size === 1) return true
  const reversed = [...DIGITS].reverse().join('')
  return DIGITS.includes(pin) || reversed.includes(pin)
}

/**
 * Vérifie qu'un secret convient au rôle.
 *
 * @throws `invalid_pin` / `weak_pin` pour un client
 * @throws `weak_password` pour les autres rôles
 */
export function assertValidSecret(roleName: string, secret: string): void {
  if (secretKindFor(roleName) === 'pin') {
    if (!PIN_PATTERN.test(secret)) {
      throw new AuthError('invalid_pin', `Le code doit compter ${PIN_LENGTH} chiffres.`, 422)
    }
    if (isWeakPin(secret)) {
      throw new AuthError(
        'weak_pin',
        'Ce code est trop facile à deviner : évitez les suites et les chiffres répétés.',
        422
      )
    }
    return
  }
  if (secret.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(
      'weak_password',
      `Le mot de passe doit compter au moins ${MIN_PASSWORD_LENGTH} caractères.`,
      422
    )
  }
}

/** Message du blocage, partagé par la connexion et ce qui la précède. */
export function pinLockedError(): AuthError {
  return new AuthError(
    'pin_locked',
    `Compte bloqué après ${MAX_PIN_ATTEMPTS} codes incorrects. Réinitialisez votre code avec « Code oublié ».`,
    423
  )
}

/**
 * Nom du rôle d'un compte. Repli sur `client` si le rôle référencé n'existe
 * plus, comme `issueTokens`.
 */
export async function roleNameOf(roleId: string): Promise<string> {
  const role = await Role.findById(roleId)
  return role?.name ?? 'client'
}
