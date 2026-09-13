import type { GoogleLoginInput, GoogleLoginOutput } from '#auth/dto/index'
import { logAuthAttempt } from '#auth/helpers/auth_audit'
import { issueTokens } from '#auth/helpers/issue_tokens'
import { assertRateLimit } from '#auth/helpers/rate_limit'
import Role from '#models/role'
import User, { type UserEntity } from '#models/user'
import GoogleAuthService, { type GoogleIdentity } from '#services/google_auth_service'
import { AuthError } from '#utils/auth_error'
import logger from '@adonisjs/core/services/logger'

import { StartTrialForOwnerUseCase } from '../../../features/subscriptions/use_cases/start_trial_for_owner.use_case.ts'

/** Rôle attribué à tout compte créé via Google. */
const DEFAULT_GOOGLE_ROLE = 'proprio' as const

/**
 * Use case : connecte (ou inscrit) un utilisateur à partir d'un ID token Google.
 *
 * Trois cas, dans cet ordre :
 *  1. Identité Google déjà liée  → connexion directe.
 *  2. Email connu d'un autre compte → liaison du provider puis connexion.
 *  3. Aucun compte               → création d'un compte déjà vérifié.
 *
 * Aucun OTP n'est nécessaire : Google atteste déjà l'adresse e-mail.
 */
export class GoogleLoginUseCase {
  async execute(input: GoogleLoginInput): Promise<GoogleLoginOutput> {
    const identity = await GoogleAuthService.verifyIdToken(input.id_token)

    await assertRateLimit(identity.email, 'verify')

    // Google peut retourner un e-mail non vérifié (comptes Workspace mal
    // configurés). On refuse : sans cette garantie, la liaison par e-mail
    // permettrait de prendre le contrôle d'un compte existant.
    if (!identity.email_verified) {
      await this.logFailure(identity, 'email_not_verified', input)
      throw new AuthError(
        'google_email_not_verified',
        "Votre adresse Google n'est pas vérifiée.",
        403
      )
    }

    const linked = await User.findOne({
      auth_provider: {
        provider: 'google',
        provider_user_id: identity.provider_user_id,
      },
    })

    if (linked) {
      return this.signIn(linked, identity, input, false)
    }

    const existing = await User.findOne({ email: identity.email })
    if (existing) {
      return this.linkAndSignIn(existing, identity, input)
    }

    return this.createAndSignIn(identity, input)
  }

  /** Cas 1 : identité déjà liée. */
  private async signIn(
    user: UserEntity,
    identity: GoogleIdentity,
    input: GoogleLoginInput,
    isNewUser: boolean
  ): Promise<GoogleLoginOutput> {
    this.assertUsable(user, identity, input)

    // L'avatar Google change ; on garde le profil à jour sans écraser un
    // nom que l'utilisateur aurait personnalisé côté application.
    if (identity.avatar_url && user.avatar_url !== identity.avatar_url) {
      user.avatar_url = identity.avatar_url
    }
    user.last_login_at = new Date()
    await user.save()

    await logAuthAttempt({
      user_id: user._id,
      type: 'verify',
      status: 'success',
      channel: 'google',
      target: identity.email,
      device: input.device,
    })

    const tokens = await issueTokens(user, input.device)
    return { ...tokens, is_new_user: isNewUser }
  }

  /** Cas 2 : compte existant avec le même e-mail vérifié → on rattache Google. */
  private async linkAndSignIn(
    user: UserEntity,
    identity: GoogleIdentity,
    input: GoogleLoginInput
  ): Promise<GoogleLoginOutput> {
    this.assertUsable(user, identity, input)

    user.auth_providers = [
      ...(user.auth_providers ?? []),
      {
        provider: 'google',
        provider_user_id: identity.provider_user_id,
        email: identity.email,
        linked_at: new Date(),
      },
    ]

    // Google a vérifié l'e-mail : un compte resté en attente d'OTP devient valide.
    user.is_verified = true

    return this.signIn(user, identity, input, false)
  }

  /** Cas 3 : premier passage → création du compte. */
  private async createAndSignIn(
    identity: GoogleIdentity,
    input: GoogleLoginInput
  ): Promise<GoogleLoginOutput> {
    const role = await Role.findOne({ name: DEFAULT_GOOGLE_ROLE })
    if (!role) {
      throw new AuthError('role_not_found', `Le rôle "${DEFAULT_GOOGLE_ROLE}" n'existe pas.`, 500)
    }

    const user = await User.create({
      // L'identifiant du document rôle est son nom (cf. `#models/role`).
      role_id: role.name,
      full_name: identity.full_name ?? identity.email.split('@')[0],
      email: identity.email,
      phone: null,
      avatar_url: identity.avatar_url,
      auth_channel: 'google',
      // Pas de mot de passe : l'authentification passe uniquement par Google.
      password: null,
      auth_providers: [
        {
          provider: 'google',
          provider_user_id: identity.provider_user_id,
          email: identity.email,
          linked_at: new Date(),
        },
      ],
      is_verified: true,
      is_active: true,
      last_login_at: new Date(),
    })

    await logAuthAttempt({
      user_id: user._id,
      type: 'generate',
      status: 'success',
      channel: 'google',
      target: identity.email,
      device: input.device,
    })

    // Le compte naît `owner_status: 'pending'` : inscrit, dossier non validé.
    // L'essai démarre malgré tout, pour que le propriétaire puisse découvrir
    // l'application pendant l'examen de sa pièce d'identité.
    await this.startTrial(user._id)

    const tokens = await issueTokens(user, input.device)
    return { ...tokens, is_new_user: true }
  }

  /**
   * Ouvre l'essai gratuit du nouveau propriétaire.
   *
   * Volontairement non bloquant : l'essai est un avantage commercial, pas une
   * condition d'inscription. Le faire échouer ici priverait l'utilisateur de
   * son compte alors qu'il vient de s'authentifier avec succès — et le use case
   * refuse déjà les doublons, ce qui rend l'appel sûr à rejouer. La commande
   * `subscriptions:expire-trials` rattrape les essais manquants.
   */
  private async startTrial(userId: string): Promise<void> {
    try {
      await new StartTrialForOwnerUseCase().execute({ user_id: userId })
    } catch (error) {
      logger.error({ err: error, user_id: userId }, "Échec du démarrage de l'essai gratuit")
    }
  }

  /** Refuse les comptes désactivés, quel que soit le chemin d'entrée. */
  private assertUsable(user: UserEntity, identity: GoogleIdentity, input: GoogleLoginInput): void {
    if (!user.is_active) {
      void this.logFailure(identity, 'account_disabled', input, user._id)
      throw new AuthError('account_disabled', 'Compte désactivé.', 403)
    }
  }

  private async logFailure(
    identity: GoogleIdentity,
    reason: string,
    input: GoogleLoginInput,
    userId?: string | null
  ): Promise<void> {
    await logAuthAttempt({
      user_id: userId ?? null,
      type: 'verify',
      status: 'failed',
      channel: 'google',
      target: identity.email,
      failure_reason: reason,
      device: input.device,
    })
  }
}

export default GoogleLoginUseCase
