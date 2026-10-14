/**
 * Pièces d'identité acceptées pour la validation d'un dossier propriétaire.
 *
 * Les codes sont stables et indépendants de la langue d'affichage : le libellé
 * montré à l'utilisateur est décidé par le client, pas par la base.
 */
export const ID_DOCUMENT_TYPES = ['cni', 'passport', 'driving_licence'] as const

export type IdDocumentType = (typeof ID_DOCUMENT_TYPES)[number]

export const IdDocumentTypeEnum = {
  /** Carte nationale d'identité. */
  CNI: 'cni',
  PASSPORT: 'passport',
  DRIVING_LICENCE: 'driving_licence',
} as const satisfies Record<string, IdDocumentType>

/**
 * Types dont le verso porte une information et doit donc être fourni.
 *
 * Un passeport s'identifie par sa seule page de données : en exiger le verso
 * bloquerait des dossiers parfaitement valides.
 */
export const ID_DOCUMENT_TYPES_REQUIRING_BACK: IdDocumentType[] = ['cni', 'driving_licence']

/** Le verso est-il requis pour ce type de pièce ? */
export function requiresBackSide(type: IdDocumentType): boolean {
  return ID_DOCUMENT_TYPES_REQUIRING_BACK.includes(type)
}
