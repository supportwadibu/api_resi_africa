import { normalizePropertyIds } from '#models/manager_assignment'
import HashService from '#services/hash_service'
import { DomainError } from '#utils/domain_error'

import { toManagerDto, type CreateManagerInput, type ManagerDto } from '../dto/manager.dto.ts'
import ManagerRepository from '../repositories/manager_repository.ts'

/**
 * Tous les logements demandés appartiennent-ils bien au propriétaire ?
 *
 * Sans ce contrôle, un identifiant deviné suffirait à s'affecter le logement
 * d'autrui — même garde que `findByIdAndOwner` sur les résidences.
 *
 * Un périmètre vide passe : un gérant créé sans logement est légitime, le
 * propriétaire lui en attribuera ensuite, et `filterByScope` lui refuse
 * entre-temps toute lecture.
 */
export function assertPropertiesOwned(
  properties: readonly { _id: string; owner_id: string }[],
  requestedIds: readonly string[],
  ownerId: string
): void {
  const owned = new Set(properties.filter((p) => p.owner_id === ownerId).map((p) => p._id))
  const foreign = requestedIds.filter((id) => !owned.has(id))

  if (foreign.length > 0) {
    throw new DomainError(
      'property_not_owned',
      'Un des logements sélectionnés ne vous appartient pas.',
      422
    )
  }
}

/**
 * Le canal d'authentification du gérant.
 *
 * Le téléphone prime : au comptoir, c'est le numéro que le propriétaire connaît
 * et a vérifié, l'e-mail restant souvent absent.
 */
export function resolveAuthChannel(input: {
  email?: string | null
  phone?: string | null
}): 'email' | 'phone' {
  return input.phone ? 'phone' : 'email'
}

/**
 * Crée un compte gérant et son affectation.
 *
 * Pas d'OTP et `is_verified: true` dès la création : le propriétaire enregistre
 * une personne qu'il connaît et dont il a vérifié le numéro, et fixe lui-même
 * le mot de passe initial que le gérant changera depuis son profil. Voir
 * « Compte gérant » dans `docs/specs/gerant-design.md`.
 */
export class CreateManagerUseCase {
  constructor(private repo: ManagerRepository = new ManagerRepository()) {}

  async execute(input: CreateManagerInput): Promise<ManagerDto> {
    const email = input.email?.trim() || null
    const phone = input.phone?.trim() || null

    // Doublon de la règle du validator, mais le use case reste la dernière
    // garde : sans e-mail ni téléphone, le gérant n'aurait aucun moyen de se
    // connecter et le compte serait inutilisable.
    if (!email && !phone) {
      throw new DomainError(
        'manager_contact_required',
        'Renseignez au moins un e-mail ou un numéro de téléphone pour ce gérant.',
        422
      )
    }

    const propertyIds = normalizePropertyIds(input.property_ids)

    const owned = await this.repo.listOwnedProperties(input.owner_id)
    assertPropertiesOwned(owned, propertyIds, input.owner_id)

    // `User.create` lève un `Error` brut sur un doublon ; on vérifie en amont
    // pour rendre un code stable au mobile plutôt qu'une erreur 500.
    if (await this.repo.accountExists({ email, phone })) {
      throw new DomainError(
        'manager_already_exists',
        'Un compte existe déjà avec cet e-mail ou ce numéro de téléphone.',
        409
      )
    }

    const account = await this.createAccount({
      full_name: input.full_name.trim(),
      email,
      phone,
      password: await HashService.make(input.password),
      auth_channel: resolveAuthChannel({ email, phone }),
      created_by: input.owner_id,
    })

    const assignment = await this.repo.upsertAssignment({
      owner_id: input.owner_id,
      manager_id: account._id,
      property_ids: propertyIds,
    })

    return toManagerDto(account, assignment)
  }

  /**
   * Le contrôle d'unicité préalable n'est pas atomique — deux créations
   * simultanées peuvent le franchir ensemble. `User.create` refait le contrôle
   * et lève alors un `Error` brut, converti ici : un `Error` brut remontant
   * d'un use case échapperait au handler d'exceptions métier.
   */
  private async createAccount(input: {
    full_name: string
    email: string | null
    phone: string | null
    password: string
    auth_channel: 'email' | 'phone'
    created_by: string
  }) {
    try {
      return await this.repo.createAccount(input)
    } catch (error) {
      if (error instanceof DomainError) throw error

      throw new DomainError(
        'manager_already_exists',
        'Un compte existe déjà avec cet e-mail ou ce numéro de téléphone.',
        409
      )
    }
  }
}

export default CreateManagerUseCase
