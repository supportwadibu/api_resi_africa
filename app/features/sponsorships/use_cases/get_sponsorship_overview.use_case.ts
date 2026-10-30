import Sponsorship from '#models/sponsorship'
import { DomainError } from '#utils/domain_error'

import type { SponsorshipOverviewDto } from '../dto/sponsorship.dto.ts'
import SponsorshipRepository from '../repositories/sponsorship_repository.ts'
import { isSponsorshipRole, isWithinAttachWindow } from '../sponsorship_rules.ts'
import ReleaseSponsorshipRewardsUseCase from './release_sponsorship_rewards.use_case.ts'

/**
 * Écran Parrainage : code, gains, filleuls comptés et règles du programme.
 *
 * Crée le compte et le code à la première visite, et libère au passage les
 * gains échus de ce parrain.
 */
export class GetSponsorshipOverviewUseCase {
  constructor(
    private repo: SponsorshipRepository = new SponsorshipRepository(),
    private release: ReleaseSponsorshipRewardsUseCase = new ReleaseSponsorshipRewardsUseCase()
  ) {}

  async execute(userId: string, now: Date = new Date()): Promise<SponsorshipOverviewDto> {
    const user = await this.repo.findUser(userId)
    if (!user || !isSponsorshipRole(user.role_id)) {
      throw new DomainError(
        'sponsorship_not_allowed',
        'Le parrainage n’est pas ouvert à ce compte.',
        403
      )
    }
    const role = user.role_id

    const [sponsored, own, settings] = await Promise.all([
      Sponsorship.listBySponsor(userId),
      Sponsorship.findBySponsored(userId),
      this.repo.settings(),
    ])

    // Avant la lecture du compte : les soldes qu'elle rend tiennent compte des
    // gains tout juste libérés.
    await this.release.forSponsor(sponsored, now)
    const account = await Sponsorship.ensureAccount({
      user_id: userId,
      role,
      full_name: user.full_name,
    })

    const sponsor = own ? await this.repo.findUser(own.sponsor_id) : null
    const createdAt = user.raw.metadata?.created_at ?? now
    const canApplyCode =
      !own &&
      isWithinAttachWindow(createdAt, now, settings.attach_window_days) &&
      !(await Sponsorship.hasPaidActivity(userId, role))

    const rewardView = (r: 'client' | 'proprio') => ({
      mode: settings.rewards[r].mode,
      value: settings.rewards[r].value,
      max_amount: settings.rewards[r].max_amount,
    })

    return {
      role,
      account: SponsorshipRepository.toAccountDto(account),
      sponsored_count: sponsored.length,
      rewarded_count: sponsored.filter((s) => s.status === 'pending' || s.status === 'earned')
        .length,
      sponsor: sponsor ? { full_name: sponsor.full_name } : null,
      can_apply_code: canApplyCode,
      program: {
        enabled: settings.enabled,
        rewards: { client: rewardView('client'), proprio: rewardView('proprio') },
        redemption: settings.redemption[role],
      },
    }
  }
}

export default GetSponsorshipOverviewUseCase
