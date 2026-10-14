/* eslint-disable prettier/prettier */
import { readPlanTier, type PlanTier } from '#features/plans/plan_tier'
import Subscription, { type SubscriptionRecord } from '#models/subscription'
import SubscriptionEvent from '#models/subscription_event'
import { type SubscriptionStatus } from '#utils/enums/subscription_status'

import type {
  ListSubscriptionsInput,
  SubscriptionDto,
} from '../dto/subscription.dto.ts'

export class SubscriptionRepository {
  static toDto(doc: SubscriptionRecord): SubscriptionDto {
    return {
      id: doc._id,
      user_id: doc.user_id,
      plan_id: doc.plan_id ?? null,
      is_trial: doc.is_trial,
      status: doc.status,
      amount: Number(doc.amount),
      plan_tier: doc.is_trial ? 'full' : readPlanTier(doc.plan_tier),
      start_date: doc.start_date,
      end_date: doc.end_date,
      trial_ends_at: doc.trial_ends_at ?? null,
      payment_reference: doc.payment_reference ?? null,
      auto_renew: doc.auto_renew,
      cancelled_at: doc.cancelled_at ?? null,
      cancel_reason: doc.cancel_reason ?? null,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    }
  }

  async create(input: {
    user_id: string
    plan_id?: string | null
    is_trial: boolean
    status: SubscriptionStatus
    amount: number
    plan_tier?: PlanTier | null
    start_date: Date
    end_date: Date
    trial_ends_at?: Date | null
    payment_reference?: string | null
    auto_renew?: boolean
  }): Promise<SubscriptionDto> {
    const doc = await Subscription.create({
      user_id: input.user_id,
      plan_id: input.plan_id ?? null,
      is_trial: input.is_trial,
      status: input.status,
      amount: input.amount,
      plan_tier: input.plan_tier ?? null,
      start_date: input.start_date,
      end_date: input.end_date,
      trial_ends_at: input.trial_ends_at ?? null,
      payment_reference: input.payment_reference ?? null,
      auto_renew: input.auto_renew ?? false,
    })
    return SubscriptionRepository.toDto(doc)
  }

  async findById(id: string): Promise<SubscriptionDto | null> {
    const doc = await Subscription.findById(id)
    return doc ? SubscriptionRepository.toDto(doc) : null
  }

  /**
   * Récupère la souscription "vivante" (pending/trial/active) de l'owner.
   */
  async findCurrentByUser(userId: string): Promise<SubscriptionDto | null> {
    const doc = await Subscription.findActiveByUser(userId)
    return doc ? SubscriptionRepository.toDto(doc) : null
  }

  /** Abonnements vivants de l'owner, bruts : voir `Subscription.findLiveByUser`. */
  async findLiveByUser(userId: string) {
    return Subscription.findLiveByUser(userId)
  }

  /**
   * Bascule une souscription en statut donné + horodate la transition
   * (cancelled_at si terminal).
   */
  async updateStatus(
    id: string,
    status: SubscriptionStatus,
    extras: { cancel_reason?: string } = {}
  ): Promise<SubscriptionDto | null> {
    const update: Record<string, unknown> = { status }
    if (status === 'cancelled' || status === 'expired') {
      update.cancelled_at = new Date()
    }
    if (extras.cancel_reason) {
      update.cancel_reason = extras.cancel_reason
    }

    const doc = await Subscription.findByIdAndUpdate(id, update)
    return doc ? SubscriptionRepository.toDto(doc) : null
  }

  /** Ouvre l'essai une seule fois ; `null` s'il existait déjà. */
  async startTrialOnce(userId: string, days: number): Promise<SubscriptionDto | null> {
    const doc = await Subscription.startTrialOnce(userId, days)
    return doc ? SubscriptionRepository.toDto(doc) : null
  }

  async existsForUser(userId: string): Promise<boolean> {
    return Subscription.existsForUser(userId)
  }

  /** Repousse l'échéance ; voir `planExtension`. */
  async extend(
    id: string,
    patch: { end_date: Date; trial_ends_at?: Date }
  ): Promise<SubscriptionDto | null> {
    const doc = await Subscription.findByIdAndUpdate(id, patch)
    return doc ? SubscriptionRepository.toDto(doc) : null
  }

  /** Trace un événement du cycle de vie dans `subscription_events`. */
  async recordEvent(input: Parameters<typeof SubscriptionEvent.create>[0]): Promise<void> {
    await SubscriptionEvent.create(input)
  }

  /**
   * Bascule à 'expired' toutes les souscriptions actives dont end_date est dépassée.
   * Idempotent — appelé lazy à chaque lecture du current.
   */
  async expireOverdue(userId?: string): Promise<number> {
    return Subscription.expireOverdue(userId)
  }

  async paginate(input: ListSubscriptionsInput): Promise<{
    data: SubscriptionDto[]
    total: number
    page: number
    perPage: number
  }> {
    const page = Math.max(1, input.page ?? 1)
    const perPage = Math.min(100, Math.max(1, input.per_page ?? 20))

    const { data, total } = await Subscription.paginate({
      userId: input.user_id || undefined,
      status: input.status,
      isTrial: typeof input.is_trial === 'boolean' ? input.is_trial : undefined,
      limit: perPage,
      offset: (page - 1) * perPage,
    })

    return {
      data: data.map((d) => SubscriptionRepository.toDto(d)),
      total,
      page,
      perPage,
    }
  }
}

export default SubscriptionRepository
