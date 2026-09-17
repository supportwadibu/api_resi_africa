import { test } from '@japa/runner'

import { SCOPE_READ_LIMIT } from '#features/managers/scope'
import ListScopedResidencesUseCase from '#features/residences/use_cases/list_scoped_residences.use_case'

import type { ActorScope } from '#features/managers/scope'
import type PropertyRepository from '#features/properties/repositories/property_repository'
import type ResidenceRepository from '#features/residences/repositories/residence_repository'

/**
 * Le regroupement rendu à un gérant ne doit jamais être tronqué en silence.
 *
 * Le défaut corrigé était invisible à la relecture : le use case demandait
 * `per_page: 1000` et `paginate` rabattait à 100 par `Math.min`. Au-delà de 100
 * logements, des résidences disparaissaient du regroupement et les
 * `units_count` devenaient faux — un compteur qui ment sur le périmètre, ce que
 * cette route existe précisément pour éviter.
 *
 * Les doubles ci-dessous remplacent les dépôts : aucun accès Firebase, et le
 * test rougit si l'on repasse par une lecture paginée.
 */
test.group('lecture non paginée du périmètre', () => {
  test('le regroupement ne passe par aucune lecture paginée', async ({ assert }) => {
    const residences = fakeResidenceRepo(150)
    const properties = fakePropertyRepo(150)

    await new ListScopedResidencesUseCase(residences.repo, properties.repo).execute(scope())

    // `paginate` rabat à 100 : l'emprunter ici retronquerait le regroupement.
    assert.isFalse(
      residences.paginateCalled,
      'ResidenceRepository.paginate ne doit pas être appelé'
    )
    assert.isFalse(properties.paginateCalled, 'PropertyRepository.paginate ne doit pas être appelé')
  })

  test('les résidences au-delà de 100 restent dans le regroupement', async ({ assert }) => {
    const residences = fakeResidenceRepo(150)
    const properties = fakePropertyRepo(150)

    const grouped = await new ListScopedResidencesUseCase(residences.repo, properties.repo).execute(
      scope()
    )

    // 150 résidences d'un logement chacune : une lecture rabattue à 100 en
    // rendrait 100, et les 50 dernières seraient perdues sans erreur.
    assert.lengthOf(grouped, 150)
  })

  test('les unités au-delà de 100 sont comptées', async ({ assert }) => {
    const residences = fakeResidenceRepo(1)
    // 150 logements, tous dans l'unique résidence.
    const properties = fakePropertyRepo(150, () => 'res-1')

    const [grouped] = await new ListScopedResidencesUseCase(
      residences.repo,
      properties.repo
    ).execute(scope())

    assert.equal(grouped.units_count, 150)
  })

  test('la borne partagée dépasse la borne des lectures paginées', ({ assert }) => {
    // Le défaut d'origine tenait à deux bornes concurrentes, l'appelant croyant
    // demander plus que ce que le dépôt appliquait. Une seule constante porte
    // désormais la borne, et elle doit rester au-dessus des 100 de `paginate`.
    assert.isAbove(SCOPE_READ_LIMIT, 100)
  })
})

function scope(): ActorScope {
  return { ownerId: 'owner-1', actorId: 'gerant-1', propertyIds: null }
}

/** Dépôt de résidences en mémoire : `paginate` y est un piège tracé. */
function fakeResidenceRepo(count: number) {
  const state = { paginateCalled: false }

  const data = Array.from({ length: count }, (_, i) => ({
    id: `res-${i + 1}`,
    name: `Résidence ${i + 1}`,
    units_count: 1,
  }))

  const repo = {
    async listAll() {
      return data
    },
    async paginate(_owner: string, input: { per_page?: number }) {
      state.paginateCalled = true
      // Reproduit fidèlement le rabattement du vrai dépôt : c'est lui qui
      // tronquait le regroupement.
      const perPage = Math.min(100, Math.max(1, input.per_page ?? 20))
      return { data: data.slice(0, perPage), total: data.length, page: 1, perPage }
    },
  }

  return {
    repo: repo as unknown as ResidenceRepository,
    get paginateCalled() {
      return state.paginateCalled
    },
  }
}

/** Dépôt de logements en mémoire, même piège sur `paginate`. */
function fakePropertyRepo(
  count: number,
  residenceOf: (i: number) => string = (i) => `res-${i + 1}`
) {
  const state = { paginateCalled: false }

  const data = Array.from({ length: count }, (_, i) => ({
    id: `unit-${i + 1}`,
    residence_id: residenceOf(i),
  }))

  const repo = {
    async listAllInScope() {
      return data
    },
    async paginate(filters: { per_page?: number }) {
      state.paginateCalled = true
      const perPage = Math.min(100, Math.max(1, filters.per_page ?? 20))
      return { data: data.slice(0, perPage), total: data.length, page: 1, perPage }
    },
  }

  return {
    repo: repo as unknown as PropertyRepository,
    get paginateCalled() {
      return state.paginateCalled
    },
  }
}
