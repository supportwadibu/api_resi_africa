import { deleteDocument, signedDocumentUrl, uploadDocument } from '#services/document_storage'
import { DomainError } from '#utils/domain_error'
import { requiresBackSide } from '#utils/enums/id_document_type'
import logger from '@adonisjs/core/services/logger'

import type { MultipartFile } from '@adonisjs/core/bodyparser'
import type { UserEntity, UserProfile } from '#models/user'

import type { OwnerProfileDto, SubmitOwnerProfileInput } from '../dto/owner.dto.ts'
import OwnerRepository from '../repositories/owner_repository.ts'

/** Justificatifs transmis avec le dossier. Absents lors d'une simple correction. */
export interface OwnerProfileDocuments {
  front?: MultipartFile
  back?: MultipartFile
}

/**
 * Dépôt du dossier de validation d'un propriétaire.
 *
 * Rend le compte examinable par un administrateur : sans ce dépôt, le
 * propriétaire est suspendu à l'issue de son essai gratuit
 * (`SuspendUnverifiedOwnersUseCase`) sans avoir jamais eu la possibilité de
 * fournir ses pièces.
 *
 * Le dossier est modifiable tant qu'il n'a pas été validé — un document illisible
 * doit pouvoir être remplacé. Une fois le compte `active`, les pièces sont
 * figées : les rejouer permettrait de substituer une identité à celle qu'un
 * administrateur a effectivement examinée.
 */
export class SubmitOwnerProfileUseCase {
  constructor(private repo: OwnerRepository = new OwnerRepository()) {}

  async execute(
    input: SubmitOwnerProfileInput,
    documents: OwnerProfileDocuments = {}
  ): Promise<OwnerProfileDto> {
    const owner = await this.repo.findEntityById(input.user_id)
    if (!owner) {
      throw new DomainError('owner_not_found', 'Propriétaire introuvable.', 404)
    }

    if (owner.owner_status === 'active') {
      throw new DomainError(
        'owner_already_validated',
        'Votre dossier est déjà validé. Contactez le support pour toute modification.',
        409
      )
    }

    const current = owner.profile

    // Le recto est indispensable ; le verso ne l'est que pour les pièces qui en
    // portent une. Les fichiers déjà déposés comptent : une correction du seul
    // numéro de pièce n'a pas à réenvoyer les images.
    const hasFront = Boolean(documents.front ?? current.id_document_front_public_id)
    if (!hasFront) {
      throw new DomainError(
        'id_document_front_required',
        'Le recto de la pièce d’identité est requis.',
        422
      )
    }

    const backNeeded = requiresBackSide(input.id_document_type)
    const hasBack = Boolean(documents.back ?? current.id_document_back_public_id)
    if (backNeeded && !hasBack) {
      throw new DomainError(
        'id_document_back_required',
        'Le verso de la pièce d’identité est requis pour ce type de document.',
        422
      )
    }

    const uploaded = await this.uploadDocuments(input.user_id, documents)

    const frontId = uploaded.front ?? current.id_document_front_public_id
    // Changer de type de pièce vers un document sans verso rend l'ancien verso
    // caduc : le conserver afficherait la face d'une pièce qui n'est plus celle
    // du dossier.
    const backId = backNeeded ? (uploaded.back ?? current.id_document_back_public_id) : null

    const profile: UserProfile = {
      ...current,
      address: input.address ?? current.address,
      city: input.city ?? current.city,
      country: input.country ?? current.country,
      id_document_type: input.id_document_type,
      id_document_number: input.id_document_number,
      // `cin` préexistait et désigne la même donnée : le tenir à jour évite que
      // deux champs du même document divergent.
      cin: input.id_document_number,
      id_document_front_public_id: frontId,
      id_document_back_public_id: backId,
      submitted_at: new Date(),
    }

    owner.profile = profile
    owner.full_name = input.full_name
    owner.phone = input.phone

    // Un dossier redéposé après rejet doit repartir en examen, sinon la
    // correction resterait invisible pour l'administrateur.
    if (owner.owner_status === 'rejected' || owner.owner_status === 'suspended') {
      owner.owner_status = 'pending'
    }

    await owner.save()

    // Le verso abandonné n'est supprimé qu'une fois la nouvelle version
    // enregistrée : en cas d'échec de l'écriture, l'ancien dossier reste intact.
    await this.cleanupAbandonedBack(current, backId)

    return SubmitOwnerProfileUseCase.toDto(owner)
  }

  /**
   * Envoie les justificatifs présents et retourne leurs identifiants.
   *
   * L'identifiant est déterministe (`owners/<id>/id_front`) : un nouveau dépôt
   * écrase le précédent au lieu d'accumuler des fichiers orphelins. Aucun
   * nettoyage n'est donc requis lors d'un simple remplacement.
   */
  private async uploadDocuments(
    userId: string,
    documents: OwnerProfileDocuments
  ): Promise<{ front?: string; back?: string }> {
    const uploaded: { front?: string; back?: string } = {}

    if (documents.front) {
      uploaded.front = await uploadDocument(documents.front, `owners/${userId}/id_front`)
    }
    if (documents.back) {
      uploaded.back = await uploadDocument(documents.back, `owners/${userId}/id_back`)
    }

    return uploaded
  }

  /**
   * Supprime le verso devenu inutile après un changement de type de pièce.
   *
   * Seul cas où un fichier subsiste sans référence : les remplacements écrasent
   * l'original, mais passer d'une CNI à un passeport détache définitivement le
   * verso. Le laisser conserverait la face d'une pièce d'identité que
   * l'utilisateur ne présente plus — donc une donnée personnelle sans usage.
   *
   * Le nettoyage est accessoire : un fichier résiduel ne doit pas faire échouer
   * un dépôt par ailleurs enregistré.
   */
  private async cleanupAbandonedBack(
    previous: UserProfile,
    nextBackId: string | null
  ): Promise<void> {
    const obsolete = previous.id_document_back_public_id
    if (!obsolete || obsolete === nextBackId) return

    try {
      await deleteDocument(obsolete)
    } catch (error) {
      logger.warn(
        { err: error, public_id: obsolete },
        "Échec de la suppression d'un justificatif abandonné"
      )
    }
  }

  /**
   * Projette une entité en DTO, images comprises.
   *
   * Les URLs signées sont générées ici et nulle part ailleurs : elles expirent,
   * et ne doivent donc jamais être mises en cache ni persistées. La signature
   * est calculée localement, sans appel réseau.
   */
  static toDto(owner: UserEntity): OwnerProfileDto {
    const profile = owner.profile
    const raw = owner.raw

    return {
      full_name: owner.full_name,
      email: owner.email,
      phone: owner.phone,
      avatar_url: owner.avatar_url,
      address: profile.address,
      city: profile.city,
      country: profile.country,
      id_document_type: profile.id_document_type,
      id_document_number: profile.id_document_number,
      id_document_front_url: signedDocumentUrl(profile.id_document_front_public_id),
      id_document_back_url: signedDocumentUrl(profile.id_document_back_public_id),
      submitted_at: profile.submitted_at,
      is_submitted: profile.submitted_at !== null,
      owner_status: owner.owner_status,
      rejection_reason: raw.rejection_reason ?? null,
    }
  }
}

export default SubmitOwnerProfileUseCase
