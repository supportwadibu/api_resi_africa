import { creditExpiry } from '#features/subscriptions/cancellation_policy'
import { normalizePhone } from '#models/client'
import Sponsorship from '#models/sponsorship'
import { DomainError } from '#utils/domain_error'

import type { RedemptionDto } from '../dto/sponsorship.dto.ts'
import SponsorshipRepository from '../repositories/sponsorship_repository.ts'
import { isSponsorshipRole, type RedemptionType } from '../sponsorship_rules.ts'
import ReleaseSponsorshipRewardsUseCase from './release_sponsorship_rewards.use_case.ts'

/**
 * Retrait ou conversion des gains.
 *
 * - `withdrawal` : débité aussitôt, versé à la main sur Wave par l'équipe —
 *   même circuit que les retraits de portefeuille, sans frais : c'est RESI
 *   qui récompense, le gain se verse en entier ;
 * - `stay_credit` (client) : crédit déduit de ses prochaines réservations ;
 * - `subscription_credit` (propriétaire) : crédit déduit de son prochain
 *   abonnement, sur le même document que le crédit d'une résiliation.
 */
export class RequestRedemptionUseCase {
  constructor(
    private repo: SponsorshipRepository = new SponsorshipRepository(),
    private release: ReleaseSponsorshipRewardsUseCase = new ReleaseSponsorshipRewardsUseCase()
  ) {}

  async execute(input: {
    user_id: string
    type: RedemptionType
    amount: number
    payout_phone?: string
    payout_name?: string
    now?: Date
  }): Promise<RedemptionDto> {
    const now = input.now ?? new Date()
    const user = await this.repo.findUser(input.user_id)
    if (!user || !isSponsorshipRole(user.role_id)) {
      throw new DomainError(
        'sponsorship_not_allowed',
        'Le parrainage n’est pas ouvert à ce compte.',
        403
      )
    }

    if (input.type === 'withdrawal' && !input.payout_phone) {
      throw new DomainError('payout_number_required', 'Indiquez le numéro Wave à créditer.', 422)
    }

    // Un gain échu mais pas encore libéré par l'ordonnanceur doit compter.
    await this.release.forSponsor(await Sponsorship.listBySponsor(input.user_id), now)
    await Sponsorship.ensureAccount({
      user_id: input.user_id,
      role: user.role_id,
      full_name: user.full_name,
    })

    const settings = await this.repo.settings()
    const redemption = await Sponsorship.redeem({
      user_id: input.user_id,
      type: input.type,
      amount: input.amount,
      rule: settings.redemption[user.role_id],
      payout_phone: input.payout_phone ? normalizePhone(input.payout_phone) : null,
      payout_name: input.payout_name?.trim() || null,
      subscription_credit_expires_at: creditExpiry(now),
      now,
    })
    if (!redemption) {
      throw new DomainError(
        'sponsorship_account_not_found',
        'Compte de parrainage introuvable.',
        404
      )
    }

    return SponsorshipRepository.toRedemptionDto(redemption)
  }
}

export default RequestRedemptionUseCase
