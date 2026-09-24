import type { PaginationMeta } from '#features/feedbacks/dto/feedback.dto'
import type { ResidenceDto } from '#features/residences/dto/residence.dto'
import type { UserSummaryDto } from '#features/users/dto/user.dto'

import type { PropertyDto, PropertyStatus, PropertyType } from './property.dto.ts'

/**
 * Vues du catalogue pour le back-office, tous propriétaires confondus.
 *
 * Un logement est l'unité louable ; une résidence regroupe un ou plusieurs
 * logements sans jamais se louer elle-même, et un logement peut n'appartenir à
 * aucune résidence. D'où deux lectures complémentaires plutôt qu'une seule
 * liste mêlant les deux natures :
 *
 * - la liste des **logements**, où chacun porte sa résidence (`null` pour un
 *   logement autonome) ;
 * - la liste des **résidences**, où chacune porte ses logements.
 *
 * Le portefeuille d'un propriétaire réunit les deux : ses résidences avec
 * leurs unités, puis ses logements autonomes.
 */

/** Logement réduit à ce qu'une ligne de liste affiche. */
export interface PropertySummaryDto {
  id: string
  title: string
  /** Nom de l'unité dans sa résidence — « Studio 1 ». */
  unit_label: string | null
  property_type: PropertyType
  status: PropertyStatus
  daily_price: number
  city: string
  /** Première image, `null` si le logement n'en a aucune. */
  image: string | null
  residence_id: string | null
}

export interface ResidenceSummaryDto {
  id: string
  name: string
  city: string
}

/** Logement vu du back-office : ses relations sont jointes. */
export interface PlatformPropertyDto extends PropertyDto {
  owner: UserSummaryDto | null
  /**
   * Résidence d'appartenance, `null` pour un logement autonome — ou dont la
   * résidence a été supprimée depuis : `residence_id` reste alors renseigné
   * et signale le rattachement orphelin.
   */
  residence: ResidenceSummaryDto | null
}

/** Résidence avec ses logements. */
export interface ResidenceWithUnitsDto extends ResidenceDto {
  units: PropertySummaryDto[]
}

export interface PlatformResidenceDto extends ResidenceWithUnitsDto {
  owner: UserSummaryDto | null
}

export interface OwnerPortfolioDto {
  residences: ResidenceWithUnitsDto[]
  /**
   * Logements hors résidence. Y figurent aussi ceux dont la résidence
   * n'existe plus : les omettre les ferait disparaître du back-office.
   */
  standalone: PropertySummaryDto[]
  totals: {
    residences: number
    properties: number
    standalone: number
  }
}

export interface ListPlatformPropertiesInput {
  owner_id?: string
  residence_id?: string
  status?: PropertyStatus
  property_type?: PropertyType
  page?: number
  per_page?: number
}

export interface ListPlatformPropertiesOutput {
  data: PlatformPropertyDto[]
  meta: PaginationMeta
}

export interface ListPlatformResidencesInput {
  owner_id?: string
  page?: number
  per_page?: number
}

export interface ListPlatformResidencesOutput {
  data: PlatformResidenceDto[]
  meta: PaginationMeta
}
