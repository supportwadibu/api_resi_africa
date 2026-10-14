import { test } from '@japa/runner'

import GerantBookingController from '#controllers/gerant/booking_controller'
import GerantClientController from '#controllers/gerant/client_controller'
import GerantExpenseController from '#controllers/gerant/expense_controller'
import {
  CheckOutBookingUseCase,
  ExtendOwnerBookingUseCase,
  FindOwnerBookingUseCase,
} from '#features/bookings/use_cases/index'
import {
  GetScopedClientUseCase,
  ListClientBookingsUseCase,
  UpdateClientUseCase,
} from '#features/clients/use_cases/index'
import {
  DeleteExpenseUseCase,
  FindExpenseUseCase,
  GetExpenseSummaryUseCase,
  UpdateExpenseUseCase,
} from '#features/expenses/use_cases/index'

import type { ActorScope } from '#features/managers/scope'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Les six routes atteignables par un identifiant deviné vérifient le périmètre
 * **avant** d'écrire.
 *
 * C'est l'angle mort que ces tests comblent : le code est correct aujourd'hui,
 * mais déplacer la garde après l'écriture — ou la supprimer — ne cassait rien.
 * Le cadrage sur `owner_id` que portent les use cases ne rattrape pas la
 * bévue : un gérant agit pour le compte du propriétaire, si bien que *toutes*
 * les réservations et dépenses de celui-ci passent ce cadrage, y compris celles
 * des logements qui ne lui sont pas confiés.
 *
 * Les use cases sont instanciés en dur par les contrôleurs. Leur `execute` est
 * donc remplacé sur le prototype, ce qui intercepte l'appel quel que soit
 * l'instant de l'instanciation — et coupe par la même occasion tout accès
 * Firebase : aucun de ces tests ne joint Firestore.
 */
test.group('ordre garde / écriture sur le périmètre', (group) => {
  let calls: string[] = []
  const restore: Array<() => void> = []

  group.each.setup(() => {
    calls = []
  })

  group.each.teardown(() => {
    while (restore.length) restore.pop()!()
  })

  /** Remplace `execute` et journalise l'appel sous `label`. */
  function spy(target: { prototype: { execute: unknown } }, label: string, result: unknown = {}) {
    const original = target.prototype.execute

    target.prototype.execute = async (...args: unknown[]) => {
      calls.push(label)
      return typeof result === 'function'
        ? (result as (...a: unknown[]) => unknown)(...args)
        : result
    }

    restore.push(() => {
      target.prototype.execute = original
    })
  }

  test('PATCH /bookings/:id : la garde précède la prolongation', async ({ assert }) => {
    spy(FindOwnerBookingUseCase, 'garde', { id: 'bk-1', property_id: 'in-scope' })
    spy(ExtendOwnerBookingUseCase, 'écriture')

    await new GerantBookingController().update(
      ctx({ check_out_at: iso('2026-03-01'), received_amount: 1000 })
    )

    assert.deepEqual(calls, ['garde', 'écriture'])
  })

  test('PATCH /bookings/:id : un logement hors périmètre n’écrit rien', async ({ assert }) => {
    spy(FindOwnerBookingUseCase, 'garde', { id: 'bk-1', property_id: 'hors-périmètre' })
    spy(ExtendOwnerBookingUseCase, 'écriture')

    await assert.rejects(() =>
      new GerantBookingController().update(
        ctx({ check_out_at: iso('2026-03-01'), received_amount: 1000 })
      )
    )

    // Le point décisif : l'écriture n'a pas eu lieu. Une garde déplacée après
    // elle lèverait la même erreur tout en ayant déjà modifié la réservation.
    assert.deepEqual(calls, ['garde'])
  })

  test('GET /bookings/:id : un logement hors périmètre ne rend rien', async ({ assert }) => {
    spy(FindOwnerBookingUseCase, 'garde', { id: 'bk-1', property_id: 'hors-périmètre' })

    await assert.rejects(() => new GerantBookingController().show(ctx()))
  })

  test('PATCH /clients/:id : la garde précède la modification', async ({ assert }) => {
    spy(GetScopedClientUseCase, 'garde', { id: 'cl-1' })
    spy(UpdateClientUseCase, 'écriture')

    await new GerantClientController().update(ctx({ full_name: 'Awa' }))

    assert.deepEqual(calls, ['garde', 'écriture'])
  })

  test('PATCH /clients/:id : une fiche hors carnet n’est pas modifiée', async ({ assert }) => {
    spy(GetScopedClientUseCase, 'garde', () => {
      throw new Error('out_of_scope')
    })
    spy(UpdateClientUseCase, 'écriture')

    await assert.rejects(() => new GerantClientController().update(ctx({ full_name: 'Awa' })))

    assert.deepEqual(calls, ['garde'])
  })

  test('GET /clients/:id : la fiche passe par la lecture cloisonnée', async ({ assert }) => {
    spy(GetScopedClientUseCase, 'garde', { id: 'cl-1' })

    await new GerantClientController().show(ctx())

    // Sans cet appel, un identifiant deviné livrerait n'importe quelle fiche du
    // propriétaire alors même que la liste, elle, est cloisonnée.
    assert.deepEqual(calls, ['garde'])
  })

  test('PATCH /expenses/:id : la garde précède la modification', async ({ assert }) => {
    spy(FindExpenseUseCase, 'garde', { id: 'ex-1', property_id: 'in-scope' })
    spy(UpdateExpenseUseCase, 'écriture')

    await new GerantExpenseController().update(ctx({ amount: 5000 }))

    assert.deepEqual(calls, ['garde', 'écriture'])
  })

  test('PATCH /expenses/:id : une dépense hors périmètre n’est pas modifiée', async ({
    assert,
  }) => {
    spy(FindExpenseUseCase, 'garde', { id: 'ex-1', property_id: 'hors-périmètre' })
    spy(UpdateExpenseUseCase, 'écriture')

    await assert.rejects(() => new GerantExpenseController().update(ctx({ amount: 5000 })))

    assert.deepEqual(calls, ['garde'])
  })

  test('DELETE /expenses/:id : la garde précède la suppression', async ({ assert }) => {
    spy(FindExpenseUseCase, 'garde', { id: 'ex-1', property_id: 'in-scope' })
    spy(DeleteExpenseUseCase, 'écriture')

    await new GerantExpenseController().destroy(ctx())

    assert.deepEqual(calls, ['garde', 'écriture'])
  })

  test('DELETE /expenses/:id : une dépense hors périmètre n’est pas supprimée', async ({
    assert,
  }) => {
    spy(FindExpenseUseCase, 'garde', { id: 'ex-1', property_id: 'hors-périmètre' })
    spy(DeleteExpenseUseCase, 'écriture')

    await assert.rejects(() => new GerantExpenseController().destroy(ctx()))

    // Une suppression est irréversible : la garde déplacée après elle ne
    // laisserait aucun recours.
    assert.deepEqual(calls, ['garde'])
  })
})

/**
 * Les routes ouvertes après coup transmettent bien le périmètre au use case.
 *
 * Distinct du groupe ci-dessus, qui vérifie l'**ordre** des appels : ce qui est
 * en jeu ici est leur **contenu**. Les use cases acceptent tous un périmètre
 * facultatif — absent ou `null` vaut « aucune restriction », pour que le chemin
 * du propriétaire reste inchangé. C'est commode et c'est le piège : un
 * contrôleur qui oublie de le passer, ou qui passe `null`, compile, s'exécute,
 * rend une réponse plausible — et sert au gérant tout le parc du propriétaire.
 * Seule une assertion sur l'argument réellement transmis attrape cette bévue.
 */
test.group('le périmètre descend jusqu’au use case', (group) => {
  let received: unknown[] = []
  const restore: Array<() => void> = []

  group.each.setup(() => {
    received = []
  })

  group.each.teardown(() => {
    while (restore.length) restore.pop()!()
  })

  /** Remplace `execute` et retient les arguments reçus. */
  function capture(target: { prototype: { execute: unknown } }, result: unknown = {}) {
    const original = target.prototype.execute

    target.prototype.execute = async (...args: unknown[]) => {
      received = args
      return result
    }

    restore.push(() => {
      target.prototype.execute = original
    })
  }

  test('GET /expenses/summary : le résumé porte sur le périmètre', async ({ assert }) => {
    capture(GetExpenseSummaryUseCase, { total: 0, count: 0, by_category: [] })

    await new GerantExpenseController().summary(ctx())

    const [ownerId, filters] = received as [string, { scope_property_ids?: string[] | null }]

    assert.equal(ownerId, 'owner-1')
    // Le total et la liste sont demandés ensemble par l'écran Dépenses : un
    // résumé non cloisonné afficherait, au-dessus de deux lignes, la somme
    // dépensée sur tout le parc.
    assert.deepEqual(filters.scope_property_ids, ['in-scope'])
  })

  test('GET /clients/:id/bookings : l’historique porte sur le périmètre', async ({ assert }) => {
    capture(GetScopedClientUseCase, { id: 'cl-1' })
    capture(ListClientBookingsUseCase, { data: [], stats: {} })

    await new GerantClientController().bookings(ctx())

    const [clientId, ownerId, scopePropertyIds] = received as [string, string, string[] | null]

    assert.equal(clientId, 'res-1')
    assert.equal(ownerId, 'owner-1')
    // `null` ici rendrait l'historique complet du client — séjours faits dans
    // les logements non confiés compris —, et les cumuls avec.
    assert.deepEqual(scopePropertyIds, ['in-scope'])
  })

  test('un gérant sans affectation transmet une liste vide, jamais `null`', async ({ assert }) => {
    capture(GetExpenseSummaryUseCase, { total: 0, count: 0, by_category: [] })

    const empty = ctx()
    empty.scope = { ownerId: 'owner-1', actorId: 'gerant-1', propertyIds: [] }

    await new GerantExpenseController().summary(empty)

    const [, filters] = received as [string, { scope_property_ids?: string[] | null }]

    // L'invariant central : `[]` n'est pas `null`. Les confondre donnerait tout
    // le compte du propriétaire à un gérant fraîchement créé.
    assert.deepEqual(filters.scope_property_ids, [])
    assert.isNotNull(filters.scope_property_ids)
  })

  test('POST /bookings/:id/check-out : la garde précède la clôture', async ({ assert }) => {
    const order: string[] = []

    const originalFind = FindOwnerBookingUseCase.prototype.execute
    FindOwnerBookingUseCase.prototype.execute = async () => {
      order.push('garde')
      return { id: 'bk-1', property_id: 'in-scope' } as never
    }

    const originalCheckOut = CheckOutBookingUseCase.prototype.execute
    CheckOutBookingUseCase.prototype.execute = async () => {
      order.push('écriture')
      return {} as never
    }

    restore.push(() => {
      FindOwnerBookingUseCase.prototype.execute = originalFind
      CheckOutBookingUseCase.prototype.execute = originalCheckOut
    })

    await new GerantBookingController().checkOut(ctx())

    assert.deepEqual(order, ['garde', 'écriture'])
  })

  test('POST /bookings/:id/check-out : hors périmètre, rien n’est clôturé', async ({ assert }) => {
    const order: string[] = []

    const originalFind = FindOwnerBookingUseCase.prototype.execute
    FindOwnerBookingUseCase.prototype.execute = async () => {
      order.push('garde')
      return { id: 'bk-1', property_id: 'hors-périmètre' } as never
    }

    const originalCheckOut = CheckOutBookingUseCase.prototype.execute
    CheckOutBookingUseCase.prototype.execute = async () => {
      order.push('écriture')
      return {} as never
    }

    restore.push(() => {
      FindOwnerBookingUseCase.prototype.execute = originalFind
      CheckOutBookingUseCase.prototype.execute = originalCheckOut
    })

    await assert.rejects(() => new GerantBookingController().checkOut(ctx()))

    // Une clôture pose `completed_at` et `actual_check_out_at` : la garde
    // déplacée après elle lèverait la même erreur sur un séjour déjà clos.
    assert.deepEqual(order, ['garde'])
  })
})

/** Périmètre d'un gérant à qui un seul logement est confié. */
function scope(): ActorScope {
  return { ownerId: 'owner-1', actorId: 'gerant-1', propertyIds: ['in-scope'] }
}

/**
 * Contexte HTTP réduit à ce que lisent les contrôleurs.
 *
 * `validateUsing` rend la charge utile telle quelle : la validation VineJS est
 * éprouvée ailleurs, et ce qui est en jeu ici est uniquement l'ordre des
 * appels.
 */
function ctx(payload: Record<string, unknown> = {}): HttpContext {
  return {
    params: { id: 'res-1' },
    scope: scope(),
    request: {
      qs: () => ({}),
      validateUsing: async () => payload,
    },
    response: {
      ok: (body: unknown) => body,
      created: (body: unknown) => body,
      noContent: () => undefined,
    },
  } as unknown as HttpContext
}

/** Date au format que `validateUsing` rendrait, avec `toJSDate` à la Luxon. */
function iso(value: string) {
  return { toJSDate: () => new Date(value) }
}
