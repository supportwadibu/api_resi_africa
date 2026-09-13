export const OWNER_VALIDATION_STATUSES = ['pending', 'active', 'rejected', 'suspended'] as const

export type OwnerValidationStatus = (typeof OWNER_VALIDATION_STATUSES)[number]

export const OwnerValidationStatusEnum = {
  PENDING: 'pending',
  ACTIVE: 'active',
  REJECTED: 'rejected',
  /**
   * Essai de 14 jours écoulé sans que le dossier ait été validé.
   *
   * La suspension est fonctionnelle, jamais authentifiante : `is_active` reste
   * à `true` pour que le propriétaire puisse se connecter, consulter son état
   * et régulariser son dossier. Couper la connexion rendrait le compte
   * irrécupérable sans intervention d'un admin.
   */
  SUSPENDED: 'suspended',
} as const satisfies Record<string, OwnerValidationStatus>

/** Statuts autorisant un propriétaire à exploiter ses annonces. */
export const OPERATIONAL_OWNER_STATUSES: OwnerValidationStatus[] = ['active']
