import { DomainError } from '#utils/domain_error'

import { toManagerDto, type ManagerDto, type UpdateManagerInput } from '../dto/manager.dto.ts'
import ManagerRepository from '../repositories/manager_repository.ts'
import { loadOwnedAssignment } from './get_manager.use_case.ts'

/**
 * Renommage et coordonnées d'un gérant.
 *
 * Le mot de passe n'y figure pas : le propriétaire le fixe à la création, puis
 * c'est au gérant de le changer depuis son profil. Le lui laisser réécrire
 * ensuite permettrait de reprendre la main sur un compte qu'il ne contrôle
 * plus.
 */
export class UpdateManagerUseCase {
  constructor(private repo: ManagerRepository = new ManagerRepository()) {}

  async execute(
    managerId: string,
    ownerId: string,
    patch: UpdateManagerInput
  ): Promise<ManagerDto> {
    const assignment = await loadOwnedAssignment(this.repo, managerId, ownerId)

    const email = patch.email === undefined ? undefined : patch.email?.trim() || null
    const phone = patch.phone === undefined ? undefined : patch.phone?.trim() || null

    const current = await this.repo.findAccount(managerId)
    if (!current) {
      throw new DomainError('manager_not_found', 'Ce gérant est introuvable.', 404)
    }

    // Le compte doit conserver au moins un moyen de connexion : effacer le
    // dernier le rendrait inutilisable sans aucun moyen de le récupérer.
    const nextEmail = email === undefined ? current.email : email
    const nextPhone = phone === undefined ? current.phone : phone
    if (!nextEmail && !nextPhone) {
      throw new DomainError(
        'manager_contact_required',
        'Ce gérant doit conserver un e-mail ou un numéro de téléphone.',
        422
      )
    }

    // Firestore n'a pas d'index unique : l'unicité se vérifie par lecture, et
    // seulement sur une coordonnée réellement modifiée — sinon le compte se
    // trouverait lui-même et refuserait sa propre valeur.
    const changedEmail = nextEmail !== current.email ? nextEmail : null
    const changedPhone = nextPhone !== current.phone ? nextPhone : null
    if (
      (changedEmail || changedPhone) &&
      (await this.repo.accountExists({ email: changedEmail, phone: changedPhone }))
    ) {
      throw new DomainError(
        'manager_already_exists',
        'Un compte existe déjà avec cet e-mail ou ce numéro de téléphone.',
        409
      )
    }

    const updated = await this.repo.updateAccount(managerId, {
      full_name: patch.full_name?.trim(),
      email,
      phone,
    })

    if (!updated) {
      throw new DomainError('manager_not_found', 'Ce gérant est introuvable.', 404)
    }

    return toManagerDto(updated, assignment)
  }
}

export default UpdateManagerUseCase
