import { CreateManagerUseCase } from '#features/managers/use_cases/create_manager.use_case'
import HashService from '#services/hash_service'
import { DomainError } from '#utils/domain_error'

import type { CreateManagerInput } from '#features/managers/dto/manager.dto'
import type { AuthChannel } from '#models/user'
import type { RoleName } from '#models/role'
import type { CreateUserInput, UserDto } from '../dto/user.dto.ts'
import UserRepository from '../repositories/user_repository.ts'

/**
 * Canal de connexion d'un compte créé par un administrateur.
 *
 * Un admin se connecte au back-office par e-mail. Pour les autres rôles, le
 * téléphone prime quand il est fourni, comme pour un gérant : c'est
 * l'identifiant usuel de l'application mobile.
 */
export function authChannelFor(
  role: RoleName,
  contact: { email: string | null; phone: string | null }
): AuthChannel {
  if (role === 'admin') return 'email'
  return contact.phone ? 'phone' : 'email'
}

/**
 * Création d'un compte depuis le back-office, tous rôles.
 *
 * Pas d'OTP et `is_verified: true` : l'administrateur déclare une personne
 * qu'il connaît et fixe le mot de passe initial, que le titulaire changera
 * depuis son profil — même règle que `admin:create` et la création d'un
 * gérant par son propriétaire.
 *
 * - `proprio` naît `pending`, comme à l'inscription : il dépose son dossier,
 *   et l'essai gratuit s'ouvre à la validation.
 * - `gerant` passe par `CreateManagerUseCase`, qui écrit aussi l'affectation ;
 *   sans elle, le compte ne verrait rien. Il naît sans logement, le
 *   propriétaire lui en attribue ensuite.
 */
export class CreateUserUseCase {
  constructor(
    private repo: Pick<
      UserRepository,
      'findRoleId' | 'findEntity' | 'isEmailTaken' | 'isPhoneTaken' | 'createAccount'
    > = new UserRepository(),
    private hash: (value: string) => Promise<string> = (value) => HashService.make(value),
    private createManager: (input: CreateManagerInput) => Promise<{ _id: string }> = (input) =>
      new CreateManagerUseCase().execute(input)
  ) {}

  async execute(input: CreateUserInput & { admin_id: string }): Promise<UserDto> {
    const email = input.email?.trim() || null
    const phone = input.phone?.trim() || null
    const fullName = input.full_name.trim()

    if (!email && !phone) {
      throw new DomainError(
        'user_contact_required',
        'Renseignez au moins un e-mail ou un numéro de téléphone.',
        422
      )
    }
    if (input.role === 'admin' && !email) {
      throw new DomainError(
        'admin_email_required',
        "Un administrateur se connecte par e-mail : l'adresse est obligatoire.",
        422
      )
    }

    // Contrôlés avant tout : un doublon doit ressortir sous son code stable,
    // y compris pour un gérant, dont le use case rendrait un code plus vague.
    if (email && (await this.repo.isEmailTaken(email, ''))) {
      throw new DomainError(
        'email_already_used',
        'Un autre compte utilise déjà cette adresse e-mail.',
        409
      )
    }
    if (phone && (await this.repo.isPhoneTaken(phone, ''))) {
      throw new DomainError(
        'phone_already_used',
        'Un autre compte utilise déjà ce numéro de téléphone.',
        409
      )
    }

    const userId =
      input.role === 'gerant'
        ? await this.createManagerAccount({ ...input, email, phone, full_name: fullName })
        : await this.createAccount({ ...input, email, phone, full_name: fullName })

    const created = await this.repo.findEntity(userId)
    if (!created) {
      throw new DomainError('user_not_found', 'Utilisateur introuvable.', 404)
    }
    return UserRepository.toDto(created.raw)
  }

  private async createManagerAccount(input: CreateUserInput & { admin_id: string }) {
    const ownerId = input.owner_id?.trim()
    const owner = ownerId ? await this.repo.findEntity(ownerId) : null
    if (!owner || owner.role_id !== 'proprio') {
      throw new DomainError(
        'owner_not_found',
        'Choisissez le propriétaire pour lequel ce gérant travaille.',
        422
      )
    }

    const manager = await this.createManager({
      owner_id: owner._id,
      full_name: input.full_name,
      email: input.email,
      phone: input.phone,
      password: input.password,
      property_ids: [],
    })
    return manager._id
  }

  private async createAccount(input: CreateUserInput & { admin_id: string }) {
    const roleId = await this.repo.findRoleId(input.role)
    if (!roleId) {
      throw new DomainError(
        'role_not_found',
        `Rôle « ${input.role} » absent : lancez d’abord \`node ace seed:roles\`.`,
        500
      )
    }

    const email = input.email ?? null
    const phone = input.phone ?? null

    try {
      const account = await this.repo.createAccount({
        role_id: roleId,
        full_name: input.full_name,
        email,
        phone,
        password: await this.hash(input.password),
        auth_channel: authChannelFor(input.role, { email, phone }),
        is_verified: true,
        is_active: true,
        metadata: { created_by: input.admin_id, created_at: new Date(), updated_at: new Date() },
      })
      return account._id
    } catch (error) {
      // Le contrôle d'unicité préalable n'est pas atomique : deux créations
      // simultanées peuvent le franchir ensemble, et `User.create` lève alors
      // un `Error` brut, qui échapperait au handler d'erreurs métier.
      if (error instanceof DomainError) throw error
      throw new DomainError(
        'account_already_exists',
        'Un compte existe déjà avec cet e-mail ou ce numéro de téléphone.',
        409
      )
    }
  }
}

export default CreateUserUseCase
