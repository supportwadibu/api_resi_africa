import { DomainError } from '#utils/domain_error'

import type { PurgePreviewDto, PurgeReportDto } from '../dto/user.dto.ts'
import UserPurgeRepository from '../repositories/user_purge_repository.ts'
import UserRepository from '../repositories/user_repository.ts'

import type { UserEntity } from '#models/user'

/**
 * Le compte peut-il être supprimé définitivement ?
 *
 * Il doit d'abord être passé par la suppression douce : l'effacement est
 * irréversible, et ce second temps laisse à l'équipe l'occasion de constater
 * ce qu'il emporte (voir l'aperçu) avant d'y procéder.
 */
async function loadPurgeable(repo: UserRepository, userId: string): Promise<UserEntity> {
  const user = await repo.findEntity(userId)
  if (!user) {
    throw new DomainError('user_not_found', 'Utilisateur introuvable.', 404)
  }
  if (!user.raw.is_deleted) {
    throw new DomainError(
      'user_not_deleted',
      "Supprimez d'abord le compte : la suppression définitive ne s'applique qu'à un compte supprimé.",
      409
    )
  }
  return user
}

/** Ce que la suppression définitive emporterait, sans rien effacer. */
export class PreviewUserPurgeUseCase {
  constructor(
    private users: UserRepository = new UserRepository(),
    private purge: UserPurgeRepository = new UserPurgeRepository()
  ) {}

  async execute(userId: string): Promise<PurgePreviewDto> {
    await loadPurgeable(this.users, userId)

    const [links, items, kept, warnings] = await Promise.all([
      this.purge.countSponsorshipLinks(userId),
      this.purge.countSteps(userId),
      this.purge.countKept(userId),
      this.purge.warnings(userId),
    ])

    return { items: [...items, ...links], kept, warnings }
  }
}

/**
 * Suppression définitive d'un compte et de ses données (voir `purge_plan.ts`
 * pour ce qui est effacé et ce qui est conservé).
 *
 * L'opération n'est pas atomique : des milliers de documents dépassent une
 * transaction Firestore, et Cloudinary n'en fait pas partie. Elle est donc
 * **rejouable** — chaque étape efface ce qui reste — et le document du compte
 * est effacé en dernier : après une panne, le compte est toujours là,
 * supprimé, et l'administrateur relance la suppression.
 */
export class PurgeUserUseCase {
  constructor(
    private users: UserRepository = new UserRepository(),
    private purge: UserPurgeRepository = new UserPurgeRepository()
  ) {}

  async execute(input: { user_id: string; admin_id: string }): Promise<PurgeReportDto> {
    const { user_id: userId, admin_id: adminId } = input

    if (userId === adminId) {
      throw new DomainError(
        'cannot_delete_self',
        'Vous ne pouvez pas supprimer votre propre compte.',
        409
      )
    }

    const user = await loadPurgeable(this.users, userId)

    // D'abord ce qui a besoin du compte : son nom, pour les réservations qui
    // lui survivent chez les propriétaires.
    await this.purge.freezeClientSnapshots(userId, {
      full_name: user.full_name,
      phone: user.phone ?? '',
    })

    // Puis les fichiers : une pièce d'identité ne doit pas survivre au compte,
    // et une erreur ici arrête tout avant le moindre effacement en base.
    const filesDeleted = await this.purge.deleteFiles(userId)

    const links = await this.purge.deleteSponsorshipLinks(userId)
    const items = await this.purge.deleteSteps(userId)
    await this.purge.deleteAuthTraces(userId, [user.email, user.phone])
    await this.purge.deleteUser(userId)

    return { user_id: userId, items: [...items, ...links], files_deleted: filesDeleted }
  }
}
