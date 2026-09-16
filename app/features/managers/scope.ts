import { DomainError } from '#utils/domain_error'

/**
 * Périmètre d'action d'un appelant authentifié.
 *
 * `ownerId` reste le propriétaire des données quel que soit l'acteur : un
 * gérant agit pour le compte d'un propriétaire, il ne détient rien.
 * `actorId` est reporté dans `created_by` pour la traçabilité.
 */
export interface ActorScope {
  ownerId: string
  actorId: string
  /**
   * Logements accessibles. `null` signifie « aucune restriction » — le
   * propriétaire —, et se distingue d'un tableau vide, qui est un gérant sans
   * affectation et ne doit rien voir. Les confondre ouvrirait tout le compte.
   */
  propertyIds: string[] | null
}

/** Plafond de valeurs accepté par l'opérateur `in` de Firestore. */
export const FIRESTORE_IN_LIMIT = 30

/** Le logement est-il servi par ce périmètre ? */
export function isWithinScope(scope: ActorScope, propertyId: string | null): boolean {
  if (scope.propertyIds === null) return true
  if (!propertyId) return false
  return scope.propertyIds.includes(propertyId)
}

/**
 * Le filtrage peut-il être délégué à Firestore ?
 *
 * Non au-delà de `FIRESTORE_IN_LIMIT`, où `in` lève ; non pour un périmètre
 * vide, où `in` lève également. Ces deux cas basculent en filtrage mémoire,
 * sur le motif de `needsInMemoryFilter` dans `app/models/property.ts`.
 */
export function canUseInFilter(scope: ActorScope): boolean {
  if (scope.propertyIds === null) return false
  return scope.propertyIds.length > 0 && scope.propertyIds.length <= FIRESTORE_IN_LIMIT
}

/** Liste utilisable dans un `where(..., 'in', ...)`, ou `null` si impossible. */
export function scopeFilterIds(scope: ActorScope): string[] | null {
  return canUseInFilter(scope) ? scope.propertyIds : null
}

/** Variante levante, pour les accès à une ressource nommément désignée. */
export function assertWithinScope(scope: ActorScope, propertyId: string | null): void {
  if (isWithinScope(scope, propertyId)) return

  // 403 et non 404 : un 404 laisserait deviner par tâtonnement quels
  // identifiants existent chez le propriétaire.
  throw new DomainError('out_of_scope', 'Ce logement ne fait pas partie de votre périmètre.', 403)
}

/**
 * Charge utile commune à toute écriture faite dans un périmètre.
 *
 * `owner_id` est celui du propriétaire quel que soit l'acteur : un gérant agit
 * pour son compte et ne détient rien. Sans cela, le tableau de bord du
 * propriétaire perdrait tout ce que ses gérants produisent.
 *
 * `created_by` reste `null` pour le propriétaire, ce qui aligne ses écritures
 * sur l'historique antérieur au rôle gérant.
 */
export function buildScopedWrite(
  input: { property_id: string | null },
  scope: ActorScope
): { owner_id: string; created_by: string | null; property_id: string | null } {
  assertWithinScope(scope, input.property_id)

  return {
    owner_id: scope.ownerId,
    created_by: scope.actorId === scope.ownerId ? null : scope.actorId,
    property_id: input.property_id,
  }
}
