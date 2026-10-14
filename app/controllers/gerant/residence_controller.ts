import type { HttpContext } from '@adonisjs/core/http'

import ListScopedResidencesUseCase from '../../features/residences/use_cases/list_scoped_residences.use_case.ts'

/**
 * Résidences contenant au moins un logement du périmètre.
 *
 * **Regroupement d'affichage, et rien d'autre.** La résidence n'est jamais
 * l'unité d'affectation — voir « L'affectation se fait par logement » dans
 * `docs/specs/gerant-design.md`. Chaque résidence rendue n'expose que les
 * logements confiés, et son `units_count` est recalculé sur eux : le champ
 * dénormalisé compte les 10 logements d'une résidence dont 6 sont confiés, et
 * le rendre tel quel trahirait l'existence des 4 autres.
 *
 * Lecture seule : créer, modifier ou supprimer une résidence est fermé au
 * gérant, et n'a donc aucune route ici.
 */
export default class GerantResidenceController {
  async index(ctx: HttpContext) {
    const residences = await new ListScopedResidencesUseCase().execute(ctx.scope)
    return ctx.response.ok({ data: residences })
  }
}
