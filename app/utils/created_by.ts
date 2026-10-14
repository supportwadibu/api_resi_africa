/**
 * Auteur réel d'une saisie, ou `null`.
 *
 * Le champ a été ajouté avec le rôle gérant : les documents écrits avant ne le
 * portent pas, et son absence vaut « saisi par le propriétaire », qui était
 * jusque-là le seul acteur possible. Le repli est explicite pour que la lecture
 * d'un document historique ne casse pas.
 */
export function readCreatedBy(doc: { created_by?: string | null }): string | null {
  return doc.created_by ?? null
}

export default readCreatedBy
