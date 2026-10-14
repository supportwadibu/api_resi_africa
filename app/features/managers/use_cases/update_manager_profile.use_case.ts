import HashService from '#services/hash_service'
import { DomainError } from '#utils/domain_error'

import { toManagerDto, type ManagerDto } from '../dto/manager.dto.ts'
import ManagerRepository from '../repositories/manager_repository.ts'

export interface UpdateManagerProfileInput {
  full_name?: string
  current_password?: string
  new_password?: string
}

/**
 * Profil du gérant connecté : son nom, et son mot de passe.
 *
 * Ses **coordonnées** en sont volontairement absentes. E-mail et téléphone sont
 * les identifiants de connexion, et le propriétaire s'en sert pour retrouver le
 * compte qu'il a créé ; laisser le gérant les réécrire lui permettrait de
 * soustraire son compte à celui qui l'a ouvert. Elles restent modifiables par
 * le propriétaire, via `PATCH /proprio/managers/:id`.
 *
 * Le **périmètre** n'y figure pas davantage : un gérant qui s'affecterait des
 * logements viderait le dispositif de son sens.
 */
export class UpdateManagerProfileUseCase {
  constructor(private repo: ManagerRepository = new ManagerRepository()) {}

  async execute(managerId: string, input: UpdateManagerProfileInput): Promise<ManagerDto> {
    if (input.new_password) {
      await this.changePassword(managerId, input.current_password, input.new_password)
    }

    const account =
      input.full_name === undefined
        ? await this.repo.findAccount(managerId)
        : await this.repo.updateAccount(managerId, { full_name: input.full_name })

    if (!account) {
      throw new DomainError('manager_not_found', 'Ce compte est introuvable.', 404)
    }

    const assignment = await this.repo.findAssignment(managerId)

    return toManagerDto(account, assignment)
  }

  /**
   * Change le mot de passe, l'ancien contrôlé.
   *
   * Le contrôle n'est pas une formalité : sans lui, un jeton volé suffirait à
   * verrouiller le compte en changeant le mot de passe, là où le propriétaire
   * ne pourrait plus que le suspendre.
   */
  private async changePassword(
    managerId: string,
    currentPassword: string | undefined,
    newPassword: string
  ): Promise<void> {
    const hash = await this.repo.findPasswordHash(managerId)
    if (!hash) {
      throw new DomainError('manager_not_found', 'Ce compte est introuvable.', 404)
    }

    if (!currentPassword || !(await HashService.verify(currentPassword, hash))) {
      throw new DomainError('invalid_credentials', 'Mot de passe actuel incorrect.', 422)
    }

    const updated = await this.repo.updatePassword(managerId, await HashService.make(newPassword))
    if (!updated) {
      throw new DomainError('manager_not_found', 'Ce compte est introuvable.', 404)
    }
  }
}

export default UpdateManagerProfileUseCase
