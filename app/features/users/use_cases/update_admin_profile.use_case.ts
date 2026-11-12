import HashService from '#services/hash_service'
import { DomainError } from '#utils/domain_error'

import type { UserDto } from '../dto/user.dto.ts'
import UserRepository from '../repositories/user_repository.ts'

export interface UpdateAdminProfileInput {
  full_name?: string
  email?: string
  /** `null` retire le numéro : l'e-mail reste l'identifiant du back-office. */
  phone?: string | null
  current_password?: string
  new_password?: string
}

/**
 * L'administrateur connecté modifie son propre compte : nom, coordonnées,
 * mot de passe.
 *
 * Le mot de passe actuel est exigé pour tout changement d'**identifiant** ou
 * de **mot de passe**, pas seulement pour ce dernier. Sans lui, une session
 * volée suffirait à remplacer l'e-mail par une adresse de l'attaquant, puis à
 * réinitialiser le mot de passe par « mot de passe oublié » : le compte serait
 * pris sans que l'ancien mot de passe ait jamais servi. Le nom, lui, ne donne
 * aucun accès et se change librement.
 *
 * Un nouveau mot de passe ferme les **autres** sessions — un appareil qui
 * aurait gardé l'ancien perd l'accès — mais garde celle qui le change :
 * l'administrateur n'a pas à se reconnecter avec ce qu'il vient de saisir.
 */
export class UpdateAdminProfileUseCase {
  constructor(private repo: UserRepository = new UserRepository()) {}

  async execute(input: {
    admin_id: string
    /** `jti` du jeton d'accès de la requête : la session à préserver. */
    current_jti: string
    patch: UpdateAdminProfileInput
  }): Promise<{ user: UserDto; revoked_sessions: number }> {
    const { admin_id: adminId, patch } = input

    const user = await this.repo.findEntity(adminId)
    if (!user) {
      throw new DomainError('user_not_found', 'Utilisateur introuvable.', 404)
    }

    const emailChanges = patch.email !== undefined && patch.email !== user.email
    const phoneChanges = patch.phone !== undefined && (patch.phone ?? null) !== (user.phone ?? null)
    const passwordChanges = patch.new_password !== undefined

    if (emailChanges || phoneChanges || passwordChanges) {
      await this.assertCurrentPassword(user.password, patch.current_password)
    }

    if (emailChanges && patch.email !== undefined) {
      if (await this.repo.isEmailTaken(patch.email, adminId)) {
        throw new DomainError(
          'email_already_used',
          'Un autre compte utilise déjà cette adresse e-mail.',
          409
        )
      }
      user.email = patch.email
    }

    if (phoneChanges) {
      const phone = patch.phone ?? null
      if (phone !== null && (await this.repo.isPhoneTaken(phone, adminId))) {
        throw new DomainError(
          'phone_already_used',
          'Un autre compte utilise déjà ce numéro de téléphone.',
          409
        )
      }
      user.phone = phone
    }

    if (patch.full_name !== undefined) user.full_name = patch.full_name
    if (passwordChanges && patch.new_password !== undefined) {
      user.password = await HashService.make(patch.new_password)
    }

    await this.repo.save(user)

    // Après l'écriture : une révocation passée avant un enregistrement raté
    // déconnecterait les appareils sans que rien n'ait changé.
    const revokedSessions = passwordChanges
      ? await this.repo.revokeOtherSessions(adminId, input.current_jti, 'password_changed')
      : 0

    return { user: UserRepository.toDto(user.raw), revoked_sessions: revokedSessions }
  }

  /**
   * Même réponse que le mot de passe soit faux ou absent du compte : un
   * administrateur créé par Google n'en a pas, et doit en définir un par
   * « mot de passe oublié » avant de toucher à ses identifiants.
   */
  private async assertCurrentPassword(hash: string | null, candidate: string | undefined) {
    if (!candidate) {
      throw new DomainError(
        'current_password_required',
        'Saisissez votre mot de passe actuel pour confirmer ce changement.',
        422
      )
    }
    if (!hash || !(await HashService.verify(candidate, hash))) {
      throw new DomainError('invalid_credentials', 'Mot de passe actuel incorrect.', 422)
    }
  }
}

export default UpdateAdminProfileUseCase
