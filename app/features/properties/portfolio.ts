import type { ResidenceDto } from '#features/residences/dto/residence.dto'
import type { UserSummaryDto } from '#features/users/dto/user.dto'

import type {
  OwnerPortfolioDto,
  PlatformPropertyDto,
  PropertySummaryDto,
  ResidenceSummaryDto,
  ResidenceWithUnitsDto,
} from './dto/platform_property.dto.ts'
import type { PropertyDto } from './dto/property.dto.ts'

/**
 * Mise en forme du catalogue pour le back-office.
 *
 * Fonctions pures : les jointures sont faites par l'appelant, qui lit en lot
 * les documents cités. Firestore n'ayant pas de jointure, c'est ici que se
 * décide ce qu'affiche un logement dont la résidence a disparu.
 */

export function toPropertySummary(property: PropertyDto): PropertySummaryDto {
  return {
    id: property.id,
    title: property.title,
    unit_label: property.unit_label ?? null,
    property_type: property.property_type,
    status: property.status,
    daily_price: property.pricing?.daily_price ?? 0,
    city: property.address?.city ?? '',
    image: property.media?.images?.[0] ?? null,
    residence_id: property.residence_id ?? null,
  }
}

export function toResidenceSummary(residence: ResidenceDto): ResidenceSummaryDto {
  return { id: residence.id, name: residence.name, city: residence.address?.city ?? '' }
}

/**
 * Ordre d'affichage des unités d'une résidence.
 *
 * Tri « naturel » sur le nom d'unité : « Studio 2 » avant « Studio 10 », ce
 * qu'un tri lexicographique inverserait.
 */
export function compareUnits(a: PropertySummaryDto, b: PropertySummaryDto): number {
  const left = a.unit_label ?? a.title
  const right = b.unit_label ?? b.title
  return left.localeCompare(right, 'fr', { numeric: true, sensitivity: 'base' })
}

/**
 * Joint à chaque logement son propriétaire et sa résidence.
 *
 * Une référence introuvable donne `null` sans écarter la ligne : un logement
 * dont la résidence a été supprimée existe toujours et doit rester visible.
 */
export function attachPropertyRelations(
  properties: readonly PropertyDto[],
  owners: ReadonlyMap<string, UserSummaryDto>,
  residences: ReadonlyMap<string, ResidenceDto>
): PlatformPropertyDto[] {
  return properties.map((property) => {
    const residence = property.residence_id ? residences.get(property.residence_id) : undefined

    return {
      ...property,
      owner: owners.get(property.owner_id) ?? null,
      residence: residence ? toResidenceSummary(residence) : null,
    }
  })
}

/**
 * Range des logements sous leurs résidences.
 *
 * Contrairement au regroupement servi au gérant (`groupResidencesForScope`),
 * rien n'est filtré : une résidence encore vide est rendue avec zéro unité —
 * elle existe et le propriétaire l'a créée —, et un logement rattaché à une
 * résidence absente de la liste passe dans `standalone` plutôt que de
 * disparaître.
 */
export function groupUnitsByResidence(
  residences: readonly ResidenceDto[],
  properties: readonly PropertyDto[]
): { residences: ResidenceWithUnitsDto[]; standalone: PropertySummaryDto[] } {
  const known = new Set(residences.map((r) => r.id))
  const byResidence = new Map<string, PropertySummaryDto[]>()
  const standalone: PropertySummaryDto[] = []

  for (const property of properties) {
    const summary = toPropertySummary(property)
    const residenceId = summary.residence_id

    if (!residenceId || !known.has(residenceId)) {
      standalone.push(summary)
      continue
    }

    const bucket = byResidence.get(residenceId)
    if (bucket) bucket.push(summary)
    else byResidence.set(residenceId, [summary])
  }

  return {
    residences: residences.map((residence) => {
      const units = (byResidence.get(residence.id) ?? []).sort(compareUnits)

      // Recompté sur les unités lues plutôt que repris du compteur
      // dénormalisé, qui a pu dériver : l'administrateur doit voir le nombre
      // réel, celui qui correspond à la liste affichée juste en dessous.
      return { ...residence, units_count: units.length, units }
    }),
    standalone,
  }
}

/** Portefeuille complet d'un propriétaire. */
export function buildOwnerPortfolio(
  residences: readonly ResidenceDto[],
  properties: readonly PropertyDto[]
): OwnerPortfolioDto {
  const grouped = groupUnitsByResidence(residences, properties)

  return {
    ...grouped,
    totals: {
      residences: grouped.residences.length,
      properties: properties.length,
      standalone: grouped.standalone.length,
    },
  }
}
