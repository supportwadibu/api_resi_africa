import logger from '@adonisjs/core/services/logger'

import { DomainError } from '#utils/domain_error'

import {
  ACCOUNT_DELETION_GRACE_DAYS,
  accountDeletionNotices,
  purgeDate,
} from '../account_deletion.ts'
import UserPurgeRepository from '../repositories/user_purge_repository.ts'
import UserRepository from '../repositories/user_repository.ts'
import { PurgeUserUseCase } from './purge_user.use_case.ts'

import type { RoleName } from '#models/role'
import type { UserEntity } from '#models/user'
import type { AccountDeletionDto, AccountDeletionPreviewDto } from '../dto/user.dto.ts'

/**
 * Acteur inscrit comme auteur d'une suppression définitive faite par la
 * tâche planifiée. Aucun compte ne porte cet identifiant : la garde « on ne
 * se supprime pas soi-même » de `PurgeUserUseCase` ne peut pas se déclencher.
 */
const SYSTEM_ACTOR = 'system'

/** Comptes purgés au plus par passage de la tâche : le reste attend le suivant. */
const PURGE_BATCH = 50

async function loadDeletable(users: UserRepository, userId: string): Promise<UserEntity> {
  const user = await users.findEntity(userId)
  if (!user) {
    throw new DomainError('user_not_found', 'Utilisateur introuvable.', 404)
  }
  if (user.raw.is_deleted) {
    throw new DomainError('user_already_deleted', 'Ce compte est déjà supprimé.', 409)
  }
  // Un administrateur se supprime depuis le back-office, par un autre : seul,
  // il pourrait laisser la plateforme sans personne pour l'administrer.
  if ((user.role_id as RoleName) === 'admin') {
    throw new DomainError(
      'account_deletion_forbidden',
      'Un compte administrateur ne peut être supprimé que par un autre administrateur, depuis le back-office.',
      403
    )
  }
  return user
}

/** Ce que l'utilisateur doit savoir avant de supprimer son compte. */
export class PreviewAccountDeletionUseCase {
  constructor(
    private users: UserRepository = new UserRepository(),
    private purge: UserPurgeRepository = new UserPurgeRepository()
  ) {}

  async execute(userId: string): Promise<AccountDeletionPreviewDto> {
    const user = await loadDeletable(this.users, userId)
    const notices = accountDeletionNotices(
      user.role_id as RoleName,
      await this.purge.pendingObligations(userId)
    )

    return {
      can_delete: notices.blockers.length === 0,
      ...notices,
      grace_period_days: ACCOUNT_DELETION_GRACE_DAYS,
    }
  }
}

/**
 * Suppression demandée par l'utilisateur.
 *
 * Le compte est fermé sur-le-champ — suppression douce, sessions et appareils
 * retirés — et son effacement définitif programmé à
 * `ACCOUNT_DELETION_GRACE_DAYS` jours. La purge elle-même est celle du
 * back-office (`PurgeUserUseCase`), lancée par la tâche
 * `purge-deleted-accounts` : un seul chemin d'effacement à tenir.
 */
export class RequestAccountDeletionUseCase {
  constructor(
    private users: UserRepository = new UserRepository(),
    private purge: UserPurgeRepository = new UserPurgeRepository()
  ) {}

  async execute(input: { user_id: string; reason?: string | null }): Promise<AccountDeletionDto> {
    const user = await loadDeletable(this.users, input.user_id)

    const { blockers } = accountDeletionNotices(
      user.role_id as RoleName,
      await this.purge.pendingObligations(user._id)
    )
    if (blockers.length > 0) {
      throw new DomainError('account_deletion_blocked', blockers[0].message, 409)
    }

    const now = new Date()
    const purgeScheduledAt = purgeDate(now)
    await this.users.markDeleted(user, user._id, {
      purge_scheduled_at: purgeScheduledAt,
      reason: input.reason?.trim() || null,
    })
    // Après l'écriture : le middleware refuse déjà le compte, la révocation
    // ne fait que fermer les autres appareils.
    await this.users.revokeSessions(user._id, 'account_deleted')
    await this.users.removeDeviceTokens(user._id)

    return { deleted_at: now, purge_scheduled_at: purgeScheduledAt }
  }
}

/**
 * Efface définitivement les comptes dont la suppression demandée est échue.
 *
 * Un échec n'arrête pas le lot : la purge est rejouable, le compte reste
 * supprimé avec son échéance, et le passage suivant le reprend.
 */
export class PurgeScheduledAccountsUseCase {
  constructor(
    private users: UserRepository = new UserRepository(),
    private purgeUser: PurgeUserUseCase = new PurgeUserUseCase()
  ) {}

  async execute(now: Date = new Date()): Promise<{ purged: number; failed: number }> {
    const due = await this.users.findDuePurges(now, PURGE_BATCH)
    let purged = 0
    let failed = 0

    for (const user of due) {
      // Échéance laissée par une écriture manuelle sur un compte restauré.
      if (!user.is_deleted) continue
      try {
        await this.purgeUser.execute({ user_id: user._id, admin_id: SYSTEM_ACTOR })
        purged++
      } catch (error) {
        failed++
        logger.error({ err: error, user_id: user._id }, 'Purge planifiée d’un compte en échec')
      }
    }

    return { purged, failed }
  }
}
