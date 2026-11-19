import { assertValidSecret, roleNameOf, secretKindFor } from '#auth/helpers/pin_rules'
import User from '#models/user'
import HashService from '#services/hash_service'
import { AuthError } from '#utils/auth_error'

/**
 * Le client inscrit avant le code à 4 chiffres le choisit, juste après s'être
 * connecté avec son ancien mot de passe (`must_set_pin`).
 *
 * Réservé aux clients : propriétaires et gérants gardent un mot de passe. La
 * session ouverte à l'instant vaut preuve d'identité — le mot de passe vient
 * d'être saisi —, l'ancien secret n'est donc pas redemandé.
 *
 * **Une seule fois**, tant que le compte n'a pas de code : sans cette borne,
 * une session volée suffirait à changer le code sans rien prouver, et à
 * évincer le titulaire. Un code se change ensuite par « Code oublié », qui
 * exige le code reçu par le titulaire.
 */
export class SetPinUseCase {
  async execute(userId: string, pin: string): Promise<{ must_set_pin: false }> {
    const user = await User.findById(userId)
    if (!user) throw new AuthError('user_not_found', 'Compte introuvable.', 404)

    const roleName = await roleNameOf(user.role_id)
    if (secretKindFor(roleName) !== 'pin') {
      throw new AuthError('pin_not_applicable', 'Ce compte se connecte avec un mot de passe.', 403)
    }
    // Même condition que `must_set_pin` : un compte Google n'a pas de secret à
    // remplacer, un compte qui a déjà son code le change par la réinitialisation.
    if (user.password === null || user.password_kind === 'pin') {
      throw new AuthError(
        'pin_already_set',
        'Votre code est déjà choisi. Pour le changer, utilisez « Code oublié ».',
        409
      )
    }

    assertValidSecret(roleName, pin)
    user.setSecret(await HashService.make(pin), 'pin')
    await user.save()
    return { must_set_pin: false }
  }
}

export default SetPinUseCase
