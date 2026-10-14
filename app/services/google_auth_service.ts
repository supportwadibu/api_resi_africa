import env from '#start/env'
import { AuthError } from '#utils/auth_error'
import { OAuth2Client, type TokenPayload } from 'google-auth-library'

/**
 * Identité Google vérifiée, normalisée pour les use cases.
 */
export interface GoogleIdentity {
  /** `sub` du token : identifiant Google stable et immuable. */
  provider_user_id: string
  email: string
  email_verified: boolean
  full_name: string | null
  avatar_url: string | null
}

/**
 * Vérifie les ID tokens émis par Google.
 *
 * La vérification est déléguée à `google-auth-library`, qui contrôle la
 * signature (via les clés publiques Google, mises en cache), l'expiration,
 * l'émetteur et l'audience. On ne fait JAMAIS confiance au contenu du token
 * sans cette étape : un client peut envoyer n'importe quel JSON.
 */
export class GoogleAuthService {
  private static client: OAuth2Client | null = null

  /** Audiences autorisées (client_id Android / iOS / web). */
  private static audiences(): string[] {
    const raw = env.get('GOOGLE_CLIENT_IDS')
    const ids = (raw ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)

    if (ids.length === 0) {
      throw new AuthError(
        'google_not_configured',
        "La connexion Google n'est pas configurée sur le serveur.",
        503
      )
    }
    return ids
  }

  private static getClient(): OAuth2Client {
    if (!this.client) {
      this.client = new OAuth2Client()
    }
    return this.client
  }

  /**
   * Vérifie un ID token et retourne l'identité qu'il atteste.
   * @throws AuthError si le token est invalide, expiré ou d'une audience inattendue.
   */
  static async verifyIdToken(idToken: string): Promise<GoogleIdentity> {
    const audience = this.audiences()

    let payload: TokenPayload | undefined
    try {
      const ticket = await this.getClient().verifyIdToken({ idToken, audience })
      payload = ticket.getPayload()
    } catch (error) {
      throw new AuthError('invalid_google_token', 'Token Google invalide ou expiré.', 401, {
        cause: error,
      })
    }

    if (!payload?.sub) {
      throw new AuthError('invalid_google_token', 'Token Google invalide.', 401)
    }

    // `verifyIdToken` valide déjà l'issuer, mais on reste explicite : ce champ
    // détermine à qui l'on fait confiance pour l'attestation d'email.
    if (payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') {
      throw new AuthError('invalid_google_token', 'Émetteur du token inattendu.', 401)
    }

    if (!payload.email) {
      throw new AuthError(
        'google_email_missing',
        "Le compte Google n'expose pas d'adresse e-mail.",
        400
      )
    }

    return {
      provider_user_id: payload.sub,
      email: payload.email.toLowerCase(),
      email_verified: payload.email_verified === true,
      full_name: payload.name ?? null,
      avatar_url: payload.picture ?? null,
    }
  }
}

export default GoogleAuthService
