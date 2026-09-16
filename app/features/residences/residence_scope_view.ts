/** Résidence réduite à ce que le regroupement en lit. */
export interface GroupableResidence {
  id: string
  units_count: number
}

/** Logement réduit à son rattachement. */
export interface GroupableUnit {
  residence_id?: string | null
}

/**
 * Résidence telle qu'elle se présente à un gérant.
 *
 * `units_count` y est **recalculé sur le périmètre**, et non repris du champ
 * dénormalisé : celui-ci compte les logements de toute la résidence et
 * trahirait l'existence de ceux qui ne sont pas confiés. Une résidence de 10
 * logements dont 6 affectés s'y présente donc avec 6 unités.
 */
export type ScopedResidenceView<R extends GroupableResidence, U> = Omit<R, 'units_count'> & {
  units_count: number
  units: U[]
}

/**
 * Regroupe les logements du périmètre sous leurs résidences.
 *
 * Un **regroupement d'affichage** : la résidence n'est jamais l'unité
 * d'affectation — voir « L'affectation se fait par logement » dans
 * `docs/specs/gerant-design.md`. Ne sont rendues que les résidences contenant
 * au moins un logement du périmètre, et chacune n'expose que ceux-là.
 *
 * Les logements reçus sont supposés déjà cloisonnés par l'appelant : cette
 * fonction ne filtre pas le périmètre, elle le met en forme.
 *
 * Une unité rattachée à une résidence absente de la liste est ignorée plutôt
 * que de faire naître une fiche : la résidence a pu être supprimée depuis, et
 * la recomposer depuis la seule unité inventerait un nom.
 */
export function groupResidencesForScope<R extends GroupableResidence, U extends GroupableUnit>(
  residences: readonly R[],
  units: readonly U[]
): ScopedResidenceView<R, U>[] {
  const byResidence = new Map<string, U[]>()

  for (const unit of units) {
    const residenceId = unit.residence_id
    if (!residenceId) continue

    const bucket = byResidence.get(residenceId)
    if (bucket) bucket.push(unit)
    else byResidence.set(residenceId, [unit])
  }

  return residences
    .filter((residence) => byResidence.has(residence.id))
    .map((residence) => {
      const scopedUnits = byResidence.get(residence.id) ?? []

      return {
        ...residence,
        units_count: scopedUnits.length,
        units: scopedUnits,
      }
    })
}

export default groupResidencesForScope
