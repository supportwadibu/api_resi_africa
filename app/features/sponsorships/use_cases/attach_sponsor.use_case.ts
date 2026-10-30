import logger from '@adonisjs/core/services/logger'

import Sponsorship from '#models/sponsorship'
import { DomainError } from '#utils/domain_error'

import SponsorshipRepository from '../repositories/sponsorship_repository.ts'
import SponsorshipNotifier from '../sponsorship_notifier.ts'
import {
  isSponsorshipRole,
  isWithinAttachWindow,
  normalizeSponsorshipCode,
} from '../sponsorship_rules.ts'

/**
 * Rattache un compte au parrain dont il a saisi le code.
 *
 * Deux moments : à l'inscription (`signup`), et plus tard depuis l'écran
 * Parrainage (`later`) pour qui l'a oublié ou s'est inscrit avec Google.
 * Plus tard, deux conditions de plus : le délai de grâce, et aucune action
 * qui rapporte déjà faite — sans quoi un client fidèle se ferait
 * « parrainer » par un ami juste avant de payer.
 */
export class AttachSponsorUseCase {
  constructor(
    private repo: SponsorshipRepository = new SponsorshipRepository(),
    private notifier: SponsorshipNotifier = new SponsorshipNotifier()
  ) {}

  /**
   * À l'inscription : jamais bloquant. Le compte est créé et vérifié, un code
   * erroné ne doit pas faire échouer l'inscription — le formulaire l'a déjà
   * contrôlé (`GET /sponsorship/codes/:code`), et le code se saisit encore
   * depuis l'écran Parrainage.
   */
  async atSignup(userId: string, code: string | null | undefined): Promise<void> {
    if (!code) return
    try {
      await this.execute({ user_id: userId, code, mode: 'signup' })
    } catch (error) {
      logger.warn({ err: error, user_id: userId }, 'Code de parrainage ignoré à l’inscription')
    }
  }

  async execute(input: {
    user_id: string
    code: string
    mode: 'signup' | 'later'
    now?: Date
  }): Promise<{ sponsor_first_name: string }> {
    const now = input.now ?? new Date()
    const code = normalizeSponsorshipCode(input.code)
    const sponsorId = code ? await Sponsorship.findCodeOwner(code) : null
    if (!code || !sponsorId) {
      throw new DomainError('invalid_sponsorship_code', 'Ce code de parrainage n’existe pas.', 422)
    }

    if (sponsorId === input.user_id) {
      throw new DomainError(
        'self_sponsorship',
        'Vous ne pouvez pas utiliser votre propre code.',
        422
      )
    }

    const [user, sponsor] = await Promise.all([
      this.repo.findUser(input.user_id),
      this.repo.findUser(sponsorId),
    ])
    if (!user || !isSponsorshipRole(user.role_id)) {
      throw new DomainError('sponsorship_not_allowed', 'Ce compte ne peut pas être parrainé.', 422)
    }
    if (!sponsor || !sponsor.is_active || !isSponsorshipRole(sponsor.role_id)) {
      throw new DomainError('invalid_sponsorship_code', 'Ce code de parrainage n’existe pas.', 422)
    }

    // Deux comptes qui se parrainent l'un l'autre toucheraient chacun le gain
    // de l'autre.
    const sponsorOwn = await Sponsorship.findBySponsored(sponsorId)
    if (sponsorOwn?.sponsor_id === input.user_id) {
      throw new DomainError(
        'circular_sponsorship',
        'Ce compte est déjà votre filleul : il ne peut pas être votre parrain.',
        422
      )
    }

    if (input.mode === 'later') {
      const settings = await this.repo.settings()
      const createdAt = user.raw.metadata?.created_at ?? now
      if (!isWithinAttachWindow(createdAt, now, settings.attach_window_days)) {
        throw new DomainError(
          'sponsorship_window_closed',
          `Un code de parrainage se saisit dans les ${settings.attach_window_days} jours qui suivent l’inscription.`,
          422
        )
      }
      if (await Sponsorship.hasPaidActivity(input.user_id, user.role_id)) {
        throw new DomainError(
          'sponsorship_window_closed',
          'Un code de parrainage se saisit avant votre premier paiement.',
          422
        )
      }
    }

    const created = await Sponsorship.create({
      sponsor_id: sponsorId,
      sponsor_role: sponsor.role_id,
      sponsored_id: input.user_id,
      sponsored_role: user.role_id,
      sponsored_name: user.full_name,
      code,
    })
    if (!created) {
      throw new DomainError('already_sponsored', 'Vous avez déjà un parrain.', 409)
    }

    await this.notifier.sponsoredJoined(sponsorId, user.full_name)
    return { sponsor_first_name: sponsor.full_name.trim().split(/\s+/)[0] ?? '' }
  }
}

export default AttachSponsorUseCase
