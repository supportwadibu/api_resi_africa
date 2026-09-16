# Rôle gérant — plan d'implémentation (API)

> **Pour les agents exécutants :** SOUS-SKILL REQUISE — utiliser
> `superpowers:subagent-driven-development` (recommandé) ou
> `superpowers:executing-plans` pour dérouler ce plan tâche par tâche. Les
> étapes utilisent la syntaxe case à cocher (`- [ ]`).

**But :** permettre à un propriétaire de créer des gérants, de leur affecter
des logements, et à ces gérants de servir réservations, clients, dépenses et
chiffres sur ce seul périmètre.

**Architecture :** un middleware `scope()` résout, après l'authentification, un
`ActorScope` porté par le contexte HTTP. Les use cases existants reçoivent ce
périmètre au lieu d'un simple `owner_id` et le transmettent aux repositories,
qui filtrent sur `owner_id` **plus** appartenance à une liste de logements. Les
contrôleurs `gerant/` réutilisent les use cases `proprio` sans les dupliquer.

**Pile :** AdonisJS 7, TypeScript, Firestore, VineJS, Japa.

**Spec :** [`docs/specs/gerant-design.md`](../../specs/gerant-design.md) — le
plan argumente depuis la spec ; les deux se lisent ensemble.

## Contraintes globales

- Fichiers en `snake_case`, suffixés par leur rôle :
  `resolve_manager_scope.use_case.ts`, `manager_repository.ts`,
  `manager.dto.ts`.
- Champs JSON et Firestore en `snake_case`. Le mobile les consomme tels quels.
- Imports par alias : `#features/*`, `#models/*`, `#middleware/*`,
  `#utils/*`, `#validators/*`, `#firebase/*`. Jamais de `../../..` entre
  couches.
- Aucun accès Firestore direct depuis un contrôleur ou un use case.
- Une violation métier lève `DomainError(code, message, status)` depuis
  `#utils/domain_error`. Jamais de `throw new Error()` brut remontant d'un use
  case.
- Validation par `ctx.request.validateUsing(...)`, jamais `request.body()`.
- Commentaires en français, disant **pourquoi** et non quoi.
- Les tests unitaires ne contactent jamais Firebase.
- Commits conventionnels, description en français, sans majuscule initiale.
- `propertyIds: null` = accès total ; `propertyIds: []` = aucun accès. Ne
  jamais confondre les deux.
- Limite Firestore : `in` plafonne à **30** valeurs.

---

## Structure des fichiers

**Nouvelle feature `managers`** — création et affectation, côté propriétaire :

| Fichier | Responsabilité |
|---|---|
| `app/models/manager_assignment.ts` | Document Firestore, clé = `manager_id` |
| `app/features/managers/dto/manager.dto.ts` | Formes exposées par l'API |
| `app/features/managers/repositories/manager_repository.ts` | Accès Firestore |
| `app/features/managers/scope.ts` | `ActorScope` + filtrage, **fonctions pures** |
| `app/features/managers/use_cases/*.use_case.ts` | Un fichier par cas d'usage |
| `app/middleware/scope_middleware.ts` | Résolution par requête |
| `app/controllers/proprio/manager_controller.ts` | Routes propriétaire |
| `app/controllers/gerant/*.ts` | Routes gérant, délèguent aux use cases proprio |
| `app/validators/managers/*.ts` | Schémas VineJS |

`scope.ts` isole les décisions de filtrage en fonctions pures : c'est la partie
testable sans Firebase, et celle qui porte l'invariant de cloisonnement.

---

## Task 1 : périmètre — fonctions pures

Le cœur du cloisonnement, testable sans Firebase. Tout le reste en dépend.

**Fichiers :**
- Créer : `app/features/managers/scope.ts`
- Test : `tests/unit/managers/scope.spec.ts`

**Interfaces produites :**
```ts
export interface ActorScope {
  ownerId: string
  actorId: string
  propertyIds: string[] | null
}
export const FIRESTORE_IN_LIMIT = 30
export function isWithinScope(scope: ActorScope, propertyId: string | null): boolean
export function canUseInFilter(scope: ActorScope): boolean
export function scopeFilterIds(scope: ActorScope): string[] | null
export function assertWithinScope(scope: ActorScope, propertyId: string | null): void
```

- [ ] **Étape 1 : écrire les tests qui échouent**

```ts
import { test } from '@japa/runner'

import {
  assertWithinScope,
  canUseInFilter,
  isWithinScope,
  scopeFilterIds,
  type ActorScope,
} from '#features/managers/scope'
import { DomainError } from '#utils/domain_error'

const OWNER = 'owner-1'

function ownerScope(): ActorScope {
  return { ownerId: OWNER, actorId: OWNER, propertyIds: null }
}

function managerScope(ids: string[]): ActorScope {
  return { ownerId: OWNER, actorId: 'gerant-1', propertyIds: ids }
}

test.group('isWithinScope', () => {
  test('le propriétaire accède à tout logement', ({ assert }) => {
    assert.isTrue(isWithinScope(ownerScope(), 'studio-9'))
  })

  test('un gérant accède à un logement de son périmètre', ({ assert }) => {
    assert.isTrue(isWithinScope(managerScope(['studio-1']), 'studio-1'))
  })

  test('un gérant n’accède pas à un logement hors périmètre', ({ assert }) => {
    assert.isFalse(isWithinScope(managerScope(['studio-1']), 'studio-2'))
  })

  test('un périmètre vide n’ouvre rien', ({ assert }) => {
    assert.isFalse(isWithinScope(managerScope([]), 'studio-1'))
  })

  test('le propriétaire accède à une ressource sans logement', ({ assert }) => {
    assert.isTrue(isWithinScope(ownerScope(), null))
  })

  test('un gérant n’accède pas à une ressource sans logement', ({ assert }) => {
    // Une dépense de charge commune porte `residence_id` et non `property_id` :
    // elle relève du propriétaire, pas d'un gérant au périmètre partiel.
    assert.isFalse(isWithinScope(managerScope(['studio-1']), null))
  })
})

test.group('canUseInFilter', () => {
  test('le propriétaire ne filtre pas par liste', ({ assert }) => {
    assert.isFalse(canUseInFilter(ownerScope()))
  })

  test('29 logements passent par le filtre Firestore', ({ assert }) => {
    const ids = Array.from({ length: 29 }, (_, i) => `p-${i}`)
    assert.isTrue(canUseInFilter(managerScope(ids)))
  })

  test('30 logements passent encore par le filtre Firestore', ({ assert }) => {
    const ids = Array.from({ length: 30 }, (_, i) => `p-${i}`)
    assert.isTrue(canUseInFilter(managerScope(ids)))
  })

  test('31 logements basculent en filtrage mémoire', ({ assert }) => {
    const ids = Array.from({ length: 31 }, (_, i) => `p-${i}`)
    assert.isFalse(canUseInFilter(managerScope(ids)))
  })

  test('un périmètre vide ne passe pas par le filtre Firestore', ({ assert }) => {
    // `where(..., 'in', [])` lève côté Firestore : le cas se traite en amont.
    assert.isFalse(canUseInFilter(managerScope([])))
  })
})

test.group('scopeFilterIds', () => {
  test('rend null pour le propriétaire', ({ assert }) => {
    assert.isNull(scopeFilterIds(ownerScope()))
  })

  test('rend la liste pour un gérant sous la limite', ({ assert }) => {
    assert.deepEqual(scopeFilterIds(managerScope(['a', 'b'])), ['a', 'b'])
  })

  test('rend null au-delà de la limite, le filtrage passant en mémoire', ({ assert }) => {
    const ids = Array.from({ length: 31 }, (_, i) => `p-${i}`)
    assert.isNull(scopeFilterIds(managerScope(ids)))
  })
})

test.group('assertWithinScope', () => {
  test('laisse passer un logement du périmètre', ({ assert }) => {
    assert.doesNotThrows(() => assertWithinScope(managerScope(['studio-1']), 'studio-1'))
  })

  test('lève out_of_scope en 403 hors périmètre', ({ assert }) => {
    assert.throws(() => assertWithinScope(managerScope(['studio-1']), 'studio-2'))

    try {
      assertWithinScope(managerScope(['studio-1']), 'studio-2')
      assert.fail('aurait dû lever')
    } catch (error) {
      assert.instanceOf(error, DomainError)
      assert.equal((error as DomainError).code, 'out_of_scope')
      assert.equal((error as DomainError).status, 403)
    }
  })
})
```

- [ ] **Étape 2 : lancer les tests et vérifier qu'ils échouent**

Lancer : `npm run test`
Attendu : ÉCHEC — module `#features/managers/scope` introuvable.

- [ ] **Étape 3 : écrire l'implémentation**

```ts
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
```

- [ ] **Étape 4 : lancer les tests et vérifier qu'ils passent**

Lancer : `npm run test`
Attendu : SUCCÈS, 17 tests.

- [ ] **Étape 5 : typecheck et lint**

Lancer : `npm run typecheck && npm run lint`

- [ ] **Étape 6 : commit**

```bash
git add app/features/managers/scope.ts tests/unit/managers/scope.spec.ts
git commit -m "feat(managers): perimetre d'action et filtrage par logement"
```

---

## Task 2 : rôle `gerant` et modèle d'affectation

**Fichiers :**
- Modifier : `app/models/role.ts` (ligne 3, `ROLE_NAMES`)
- Modifier : `app/firebase/firestore.ts` (`COLLECTIONS`)
- Créer : `app/models/manager_assignment.ts`
- Test : `tests/unit/managers/manager_assignment.spec.ts`

**Interfaces consommées :** aucune.

**Interfaces produites :**
```ts
export interface ManagerAssignmentDocument {
  owner_id: string
  manager_id: string
  property_ids: string[]
  is_active: boolean
  created_at: Date
  updated_at: Date
}
export type ManagerAssignmentRecord = WithId<ManagerAssignmentDocument>
const ManagerAssignment = {
  findByManagerId(managerId: string): Promise<ManagerAssignmentRecord | null>
  findByOwner(ownerId: string): Promise<ManagerAssignmentRecord[]>
  upsert(input: {...}): Promise<ManagerAssignmentRecord>
  replaceProperties(managerId: string, propertyIds: string[]): Promise<ManagerAssignmentRecord | null>
  setActive(managerId: string, isActive: boolean): Promise<ManagerAssignmentRecord | null>
}
export function normalizePropertyIds(ids: string[]): string[]
```

- [ ] **Étape 1 : écrire le test qui échoue**

`normalizePropertyIds` est la seule partie testable sans Firebase — elle
dédoublonne et ordonne, ce qui rend une affectation idempotente.

```ts
import { test } from '@japa/runner'

import { normalizePropertyIds } from '#models/manager_assignment'

test.group('normalizePropertyIds', () => {
  test('dédoublonne les identifiants', ({ assert }) => {
    assert.deepEqual(normalizePropertyIds(['a', 'b', 'a']), ['a', 'b'])
  })

  test('ordonne pour rendre deux affectations comparables', ({ assert }) => {
    assert.deepEqual(normalizePropertyIds(['c', 'a', 'b']), ['a', 'b', 'c'])
  })

  test('écarte les chaînes vides', ({ assert }) => {
    assert.deepEqual(normalizePropertyIds(['a', '', '  ']), ['a'])
  })

  test('rend un tableau vide inchangé', ({ assert }) => {
    assert.deepEqual(normalizePropertyIds([]), [])
  })
})
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

Lancer : `npm run test`
Attendu : ÉCHEC — `normalizePropertyIds` n'existe pas.

- [ ] **Étape 3 : ajouter le rôle et la collection**

Dans `app/models/role.ts`, ligne 3 :

```ts
export const ROLE_NAMES = ['admin', 'proprio', 'client', 'gerant'] as const
```

Dans `app/firebase/firestore.ts`, à l'intérieur de `COLLECTIONS`, après
`roles: 'roles',` :

```ts
  managerAssignments: 'manager_assignments',
```

- [ ] **Étape 4 : écrire le modèle**

Créer `app/models/manager_assignment.ts` :

```ts
import { COLLECTIONS, collection, toDoc, toDocs, toPayload, type WithId } from '#firebase/firestore'

/**
 * Affectation d'un gérant : le propriétaire pour le compte de qui il agit, et
 * les logements qu'il sert.
 *
 * L'identifiant du document est le `manager_id`. Comme pour `role.ts`, la
 * lecture devient un accès direct sans requête ni index — elle a lieu à chaque
 * requête authentifiée d'un gérant — et l'unicité qui compte ici, un gérant ne
 * sert qu'un seul propriétaire, découle de la clé elle-même. Firestore ne
 * sachant pas exprimer d'index unique, c'est la seule garantie qui tienne.
 *
 * Voir `docs/specs/gerant-design.md`.
 */
export interface ManagerAssignmentDocument {
  owner_id: string
  manager_id: string
  /** Logements servis. Toujours des logements : l'affectation ignore les résidences. */
  property_ids: string[]
  is_active: boolean
  created_at: Date
  updated_at: Date
}

export type ManagerAssignmentRecord = WithId<ManagerAssignmentDocument>

function assignments() {
  return collection<ManagerAssignmentDocument>(COLLECTIONS.managerAssignments)
}

/**
 * Dédoublonne et ordonne une liste de logements.
 *
 * L'ordre rend deux affectations comparables, et le dédoublonnage évite qu'un
 * même logement compté deux fois ne fasse franchir la limite de 30 valeurs de
 * l'opérateur `in` sans raison.
 */
export function normalizePropertyIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0))].sort()
}

const ManagerAssignment = {
  /** Accès direct : l'identifiant du document est le `manager_id`. */
  async findByManagerId(managerId: string): Promise<ManagerAssignmentRecord | null> {
    if (!managerId) return null
    return toDoc<ManagerAssignmentDocument>(await assignments().doc(managerId).get())
  },

  async findByOwner(ownerId: string): Promise<ManagerAssignmentRecord[]> {
    const snapshot = await assignments()
      .where('owner_id', '==', ownerId)
      .orderBy('created_at', 'desc')
      .get()

    return toDocs<ManagerAssignmentDocument>(snapshot.docs)
  },

  async upsert(input: {
    owner_id: string
    manager_id: string
    property_ids: string[]
    is_active?: boolean
  }): Promise<ManagerAssignmentRecord> {
    const now = new Date()
    const existing = await ManagerAssignment.findByManagerId(input.manager_id)

    const payload: ManagerAssignmentDocument = {
      owner_id: input.owner_id,
      manager_id: input.manager_id,
      property_ids: normalizePropertyIds(input.property_ids),
      is_active: input.is_active ?? true,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    }

    await assignments()
      .doc(input.manager_id)
      .set(toPayload(payload) as unknown as ManagerAssignmentDocument, { merge: true })

    return { ...payload, _id: input.manager_id }
  },

  /**
   * Remplace le périmètre en entier.
   *
   * Remplacement et non fusion : le propriétaire envoie la liste complète des
   * logements qu'il veut affecter, si bien qu'un ajout et un retrait faits dans
   * le même geste deviennent une seule écriture et que l'état obtenu ne dépend
   * pas de l'ordre des requêtes.
   */
  async replaceProperties(
    managerId: string,
    propertyIds: string[]
  ): Promise<ManagerAssignmentRecord | null> {
    const existing = await ManagerAssignment.findByManagerId(managerId)
    if (!existing) return null

    const property_ids = normalizePropertyIds(propertyIds)
    await assignments().doc(managerId).update(toPayload({ property_ids, updated_at: new Date() }))

    return { ...existing, property_ids }
  },

  /** Suspend ou réactive sans supprimer l'historique ni le compte. */
  async setActive(managerId: string, isActive: boolean): Promise<ManagerAssignmentRecord | null> {
    const existing = await ManagerAssignment.findByManagerId(managerId)
    if (!existing) return null

    await assignments()
      .doc(managerId)
      .update(toPayload({ is_active: isActive, updated_at: new Date() }))

    return { ...existing, is_active: isActive }
  },
}

export default ManagerAssignment
```

- [ ] **Étape 5 : lancer les tests et vérifier qu'ils passent**

Lancer : `npm run test && npm run typecheck`
Attendu : SUCCÈS.

- [ ] **Étape 6 : ajouter le rôle au seed**

Repérer le seed des rôles : `grep -rn "Role.upsert" app/ database/ commands/ 2>/dev/null`.
Y ajouter, sur le modèle des entrées existantes :

```ts
await Role.upsert({
  name: 'gerant',
  description: "Gérant : exploite les logements affectés par un propriétaire.",
})
```

- [ ] **Étape 7 : commit**

```bash
git add app/models/role.ts app/models/manager_assignment.ts app/firebase/firestore.ts tests/unit/managers/manager_assignment.spec.ts
git commit -m "feat(managers): role gerant et modele d'affectation"
```

---

## Task 3 : middleware de résolution du périmètre

**Fichiers :**
- Créer : `app/middleware/scope_middleware.ts`
- Modifier : `start/kernel.ts` (bloc `middleware`, après `role`)
- Créer : `app/features/managers/use_cases/resolve_actor_scope.use_case.ts`
- Test : `tests/unit/managers/resolve_actor_scope.spec.ts`

**Interfaces consommées :**
- `ActorScope`, depuis `#features/managers/scope` (Task 1)
- `ManagerAssignment.findByManagerId`, depuis `#models/manager_assignment` (Task 2)

**Interfaces produites :**
```ts
export function resolveActorScope(
  user: { id: string; role: string },
  loadAssignment: (managerId: string) => Promise<ManagerAssignmentRecord | null>
): Promise<ActorScope>
```
et `ctx.scope: ActorScope` sur le `HttpContext`.

Le use case prend son chargeur en argument : c'est ce qui le rend testable sans
Firebase, le middleware lui passant le modèle réel.

- [ ] **Étape 1 : écrire les tests qui échouent**

```ts
import { test } from '@japa/runner'

import { resolveActorScope } from '#features/managers/use_cases/resolve_actor_scope.use_case'
import { DomainError } from '#utils/domain_error'

import type { ManagerAssignmentRecord } from '#models/manager_assignment'

function assignment(over: Partial<ManagerAssignmentRecord> = {}): ManagerAssignmentRecord {
  return {
    _id: 'gerant-1',
    owner_id: 'owner-1',
    manager_id: 'gerant-1',
    property_ids: ['studio-1', 'studio-2'],
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    ...over,
  }
}

test.group('resolveActorScope', () => {
  test('le propriétaire obtient un périmètre sans restriction', async ({ assert }) => {
    const scope = await resolveActorScope({ id: 'owner-1', role: 'proprio' }, async () => null)

    assert.deepEqual(scope, { ownerId: 'owner-1', actorId: 'owner-1', propertyIds: null })
  })

  test('le gérant agit pour le compte de son propriétaire', async ({ assert }) => {
    const scope = await resolveActorScope({ id: 'gerant-1', role: 'gerant' }, async () =>
      assignment()
    )

    assert.equal(scope.ownerId, 'owner-1')
    assert.equal(scope.actorId, 'gerant-1')
    assert.deepEqual(scope.propertyIds, ['studio-1', 'studio-2'])
  })

  test('un gérant sans affectation est refusé', async ({ assert }) => {
    try {
      await resolveActorScope({ id: 'gerant-1', role: 'gerant' }, async () => null)
      assert.fail('aurait dû lever')
    } catch (error) {
      assert.instanceOf(error, DomainError)
      assert.equal((error as DomainError).code, 'manager_not_assigned')
      assert.equal((error as DomainError).status, 403)
    }
  })

  test('un gérant suspendu est refusé', async ({ assert }) => {
    try {
      await resolveActorScope({ id: 'gerant-1', role: 'gerant' }, async () =>
        assignment({ is_active: false })
      )
      assert.fail('aurait dû lever')
    } catch (error) {
      assert.equal((error as DomainError).code, 'manager_not_assigned')
    }
  })

  test('un gérant sans aucun logement obtient un périmètre vide, non un accès total', async ({
    assert,
  }) => {
    const scope = await resolveActorScope({ id: 'gerant-1', role: 'gerant' }, async () =>
      assignment({ property_ids: [] })
    )

    assert.deepEqual(scope.propertyIds, [])
    assert.isNotNull(scope.propertyIds)
  })
})
```

- [ ] **Étape 2 : lancer les tests et vérifier qu'ils échouent**

Lancer : `npm run test`
Attendu : ÉCHEC — module introuvable.

- [ ] **Étape 3 : écrire le use case**

```ts
import { DomainError } from '#utils/domain_error'

import type { ActorScope } from '#features/managers/scope'
import type { ManagerAssignmentRecord } from '#models/manager_assignment'

type AssignmentLoader = (managerId: string) => Promise<ManagerAssignmentRecord | null>

/**
 * Résout le périmètre d'un appelant authentifié.
 *
 * Le chargeur d'affectation est passé en argument plutôt qu'importé : le use
 * case reste ainsi vérifiable sans contacter Firebase, conformément à la règle
 * des tests unitaires du projet.
 */
export async function resolveActorScope(
  user: { id: string; role: string },
  loadAssignment: AssignmentLoader
): Promise<ActorScope> {
  if (user.role !== 'gerant') {
    // Propriétaire, admin, client : le chemin existant, sans restriction ni
    // lecture supplémentaire.
    return { ownerId: user.id, actorId: user.id, propertyIds: null }
  }

  const assignment = await loadAssignment(user.id)

  if (!assignment || !assignment.is_active) {
    throw new DomainError(
      'manager_not_assigned',
      "Votre compte gérant n'est rattaché à aucun propriétaire actif.",
      403
    )
  }

  return {
    ownerId: assignment.owner_id,
    actorId: user.id,
    propertyIds: assignment.property_ids,
  }
}

export default resolveActorScope
```

- [ ] **Étape 4 : lancer les tests et vérifier qu'ils passent**

Lancer : `npm run test`
Attendu : SUCCÈS, 5 tests de plus.

- [ ] **Étape 5 : écrire le middleware**

```ts
import ManagerAssignment from '#models/manager_assignment'
import resolveActorScope from '#features/managers/use_cases/resolve_actor_scope.use_case'

import type { ActorScope } from '#features/managers/scope'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

declare module '@adonisjs/core/http' {
  export interface HttpContext {
    scope: ActorScope
  }
}

/**
 * Pose le périmètre d'action sur le contexte. À utiliser après `auth()`.
 *
 * Exemple : `.use([middleware.auth(), middleware.role(['gerant']), middleware.scope()])`
 */
export default class ScopeMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const user = ctx.authUser
    if (!user) {
      return ctx.response.unauthorized({
        code: 'unauthenticated',
        message: 'Authentification requise.',
      })
    }

    // La DomainError levée par le use case remonte au handler d'exceptions,
    // qui la convertit en JSON — inutile de la traduire ici.
    ctx.scope = await resolveActorScope(user, ManagerAssignment.findByManagerId)

    return next()
  }
}
```

- [ ] **Étape 6 : déclarer le middleware**

Dans `start/kernel.ts`, dans l'objet exporté sous `middleware`, après la ligne
`role: () => import('#middleware/role_middleware'),` :

```ts
  scope: () => import('#middleware/scope_middleware'),
```

- [ ] **Étape 7 : typecheck**

Lancer : `npm run typecheck && npm run lint`
Attendu : aucune erreur.

- [ ] **Étape 8 : commit**

```bash
git add app/middleware/scope_middleware.ts app/features/managers/use_cases/resolve_actor_scope.use_case.ts start/kernel.ts tests/unit/managers/resolve_actor_scope.spec.ts
git commit -m "feat(managers): middleware de resolution du perimetre"
```

---

## Task 4 : traçabilité `created_by`

**Fichiers :**
- Modifier : `app/models/booking.ts` (`BookingDocument`, `withDefaults`, mappage DTO)
- Modifier : `app/models/expense.ts` (idem)
- Modifier : `app/models/client.ts` (idem)
- Test : `tests/unit/managers/created_by.spec.ts`

**Interfaces consommées :** aucune.

**Interfaces produites :** champ `created_by: string | null` sur les trois
documents, plus :
```ts
export function readCreatedBy(doc: { created_by?: string | null }): string | null
```

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import { test } from '@japa/runner'

import { readCreatedBy } from '#utils/created_by'

test.group('readCreatedBy', () => {
  test('rend l’auteur quand il est renseigné', ({ assert }) => {
    assert.equal(readCreatedBy({ created_by: 'gerant-1' }), 'gerant-1')
  })

  test('rend null sur un document antérieur au champ', ({ assert }) => {
    // Les documents écrits avant cette version ne portent pas `created_by` :
    // absent signifie « saisi par le propriétaire », seul acteur possible alors.
    assert.isNull(readCreatedBy({}))
  })

  test('rend null sur une valeur nulle explicite', ({ assert }) => {
    assert.isNull(readCreatedBy({ created_by: null }))
  })
})
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

Lancer : `npm run test`
Attendu : ÉCHEC — `#utils/created_by` introuvable.

- [ ] **Étape 3 : écrire le helper**

Créer `app/utils/created_by.ts` :

```ts
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
```

- [ ] **Étape 4 : ajouter le champ aux trois documents**

Dans `app/models/booking.ts`, `app/models/expense.ts` et `app/models/client.ts`,
ajouter à l'interface du document :

```ts
  /**
   * Acteur ayant réellement saisi l'enregistrement — un gérant, ou `null` pour
   * le propriétaire. Optionnel : absent sur les documents antérieurs au rôle
   * gérant. Donnée d'audit, n'entrant dans aucun calcul.
   */
  created_by?: string | null
```

Dans chaque `withDefaults` correspondant :

```ts
    created_by: input.created_by ?? null,
```

- [ ] **Étape 5 : lancer les tests et vérifier qu'ils passent**

Lancer : `npm run test && npm run typecheck`
Attendu : SUCCÈS, et aucune régression sur les suites existantes.

- [ ] **Étape 6 : commit**

```bash
git add app/utils/created_by.ts app/models/booking.ts app/models/expense.ts app/models/client.ts tests/unit/managers/created_by.spec.ts
git commit -m "feat(managers): tracer l'auteur reel d'une saisie"
```

---

## Task 5 : cloisonnement des lectures — bookings, expenses, properties

**Fichiers :**
- Modifier : `app/models/booking.ts` (`BookingFilters`, `buildQuery`)
- Modifier : `app/models/expense.ts` (`ExpenseFilters`, construction de requête)
- Modifier : `app/models/property.ts` (`PropertyFilters`, `buildQuery`,
  `matchesInMemory`, `needsInMemoryFilter`)
- Test : `tests/unit/managers/scope_filtering.spec.ts`

**Interfaces consommées :**
- `ActorScope`, `isWithinScope`, `scopeFilterIds`, `canUseInFilter` (Task 1)

**Interfaces produites :**
```ts
export function filterByScope<T extends { property_id?: string | null }>(
  docs: readonly T[],
  scope: ActorScope
): T[]
```
plus un champ optionnel `scope_property_ids?: string[] | null` sur les trois
jeux de filtres.

- [ ] **Étape 1 : écrire les tests qui échouent**

```ts
import { test } from '@japa/runner'

import { filterByScope } from '#features/managers/scope'

import type { ActorScope } from '#features/managers/scope'

const OWNER: ActorScope = { ownerId: 'owner-1', actorId: 'owner-1', propertyIds: null }
const MANAGER: ActorScope = {
  ownerId: 'owner-1',
  actorId: 'gerant-1',
  propertyIds: ['studio-1', 'studio-2'],
}

const DOCS = [
  { _id: 'b1', property_id: 'studio-1', total_amount: 10000 },
  { _id: 'b2', property_id: 'studio-2', total_amount: 20000 },
  { _id: 'b3', property_id: 'studio-3', total_amount: 30000 },
  { _id: 'b4', property_id: 'studio-4', total_amount: 40000 },
]

test.group('filterByScope', () => {
  test('le propriétaire voit tout', ({ assert }) => {
    assert.lengthOf(filterByScope(DOCS, OWNER), 4)
  })

  test('le gérant ne voit que son périmètre', ({ assert }) => {
    const kept = filterByScope(DOCS, MANAGER)

    assert.lengthOf(kept, 2)
    assert.deepEqual(
      kept.map((d) => d._id),
      ['b1', 'b2']
    )
  })

  test('6 logements affectés sur 10 : les 4 autres n’apparaissent pas', ({ assert }) => {
    // L'invariant central de la spec. Une résidence de 10 logements, 6 affectés.
    const units = Array.from({ length: 10 }, (_, i) => ({
      _id: `b${i}`,
      property_id: `unit-${i}`,
      total_amount: 1000,
    }))
    const scope: ActorScope = {
      ownerId: 'owner-1',
      actorId: 'gerant-1',
      propertyIds: ['unit-0', 'unit-1', 'unit-2', 'unit-3', 'unit-4', 'unit-5'],
    }

    const kept = filterByScope(units, scope)

    assert.lengthOf(kept, 6)
    assert.equal(
      kept.reduce((sum, d) => sum + d.total_amount, 0),
      6000
    )
  })

  test('un périmètre vide ne laisse rien passer', ({ assert }) => {
    const scope: ActorScope = { ownerId: 'owner-1', actorId: 'gerant-1', propertyIds: [] }

    assert.lengthOf(filterByScope(DOCS, scope), 0)
  })

  test('une dépense de charge commune est retirée au gérant', ({ assert }) => {
    const expenses = [
      { _id: 'e1', property_id: 'studio-1', amount: 5000 },
      { _id: 'e2', property_id: null, amount: 9000 },
    ]

    const kept = filterByScope(expenses, MANAGER)

    assert.lengthOf(kept, 1)
    assert.equal(kept[0]._id, 'e1')
  })

  test('le propriétaire conserve les charges communes', ({ assert }) => {
    const expenses = [
      { _id: 'e1', property_id: 'studio-1', amount: 5000 },
      { _id: 'e2', property_id: null, amount: 9000 },
    ]

    assert.lengthOf(filterByScope(expenses, OWNER), 2)
  })
})
```

- [ ] **Étape 2 : lancer les tests et vérifier qu'ils échouent**

Lancer : `npm run test`
Attendu : ÉCHEC — `filterByScope` n'est pas exporté.

- [ ] **Étape 3 : ajouter `filterByScope` à `scope.ts`**

Ajouter à `app/features/managers/scope.ts` :

```ts
/**
 * Retient les documents du périmètre.
 *
 * Employé après lecture, dans les deux cas où Firestore ne sait pas filtrer :
 * un périmètre de plus de 30 logements, et le périmètre vide. Même motif que
 * `matchesInMemory` dans `app/models/property.ts`.
 */
export function filterByScope<T extends { property_id?: string | null }>(
  docs: readonly T[],
  scope: ActorScope
): T[] {
  if (scope.propertyIds === null) return [...docs]
  return docs.filter((doc) => isWithinScope(scope, doc.property_id ?? null))
}
```

- [ ] **Étape 4 : lancer les tests et vérifier qu'ils passent**

Lancer : `npm run test`
Attendu : SUCCÈS, 6 tests de plus.

- [ ] **Étape 5 : brancher le filtre dans `booking.ts`**

Ajouter à `BookingFilters` :

```ts
  /**
   * Logements du périmètre de l'appelant. `null` ou absent = aucune
   * restriction. Alimenté par le middleware `scope()`.
   */
  scope_property_ids?: string[] | null
```

Dans `buildQuery`, après le filtre `property_id` (ligne 126) :

```ts
  // Filtrage délégué à Firestore tant que la liste tient dans la limite de
  // l'opérateur `in` ; au-delà, `filterByScope` reprend après lecture.
  const ids = filters.scope_property_ids
  if (ids && ids.length > 0 && ids.length <= FIRESTORE_IN_LIMIT) {
    query = query.where('property_id', 'in', ids)
  }
```

Importer en tête de fichier :

```ts
import { FIRESTORE_IN_LIMIT } from '#features/managers/scope'
```

- [ ] **Étape 6 : brancher le filtre dans `expense.ts` et `property.ts`**

Même ajout de `scope_property_ids` à `ExpenseFilters` et `PropertyFilters`.

Dans `property.ts`, le filtre porte sur l'identifiant du document et non sur un
champ : utiliser `FieldPath.documentId()`.

```ts
import { FieldPath } from 'firebase-admin/firestore'
```

```ts
  const ids = filters.scope_property_ids
  if (ids && ids.length > 0 && ids.length <= FIRESTORE_IN_LIMIT) {
    query = query.where(FieldPath.documentId(), 'in', ids)
  }
```

Étendre `needsInMemoryFilter` pour qu'il rende `true` lorsque
`scope_property_ids` est un tableau que Firestore n'a pas pu appliquer —
c'est-à-dire vide ou de plus de 30 entrées —, et `matchesInMemory` pour qu'il
vérifie l'appartenance dans ce cas.

- [ ] **Étape 7 : lancer toute la suite**

Lancer : `npm run test && npm run typecheck && npm run lint`
Attendu : SUCCÈS, aucune régression — les appels existants ne passent pas
`scope_property_ids`, donc leur comportement est inchangé.

- [ ] **Étape 8 : commit**

```bash
git add app/features/managers/scope.ts app/models/booking.ts app/models/expense.ts app/models/property.ts tests/unit/managers/scope_filtering.spec.ts
git commit -m "feat(managers): cloisonner les lectures par perimetre"
```

---

## Task 6 : cloisonnement financier

L'invariant que la spec désigne comme central : les chiffres rendus au gérant
portent sur ses logements, jamais sur les autres, et ne contiennent aucun net.

**Fichiers :**
- Modifier : `app/features/finance/repositories/finance_repository.ts`
- Modifier : `app/features/finance/use_cases/get_finance_overview.use_case.ts`
- Créer : `app/features/finance/manager_overview.ts`
- Test : `tests/unit/finance/manager_overview.spec.ts`

**Interfaces consommées :**
- `ActorScope`, `filterByScope` (Tasks 1 et 5)

**Interfaces produites :**
```ts
export interface ManagerOverviewDto {
  bookings_count: number
  gross_revenue: number
  expenses_total: number
  occupancy_rate: number
  revenue_points: { month: string; value: number }[]
}
export function buildManagerOverview(input: {...}): ManagerOverviewDto
```

- [ ] **Étape 1 : écrire les tests qui échouent**

```ts
import { test } from '@japa/runner'

import { buildManagerOverview } from '#features/finance/manager_overview'

import type { ActorScope } from '#features/managers/scope'

const SCOPE: ActorScope = {
  ownerId: 'owner-1',
  actorId: 'gerant-1',
  propertyIds: ['unit-0', 'unit-1', 'unit-2', 'unit-3', 'unit-4', 'unit-5'],
}

/** Une résidence de 10 logements, dont 6 affectés au gérant. */
const BOOKINGS = Array.from({ length: 10 }, (_, i) => ({
  property_id: `unit-${i}`,
  start_date: new Date('2026-10-01T12:00:00Z'),
  end_date: new Date('2026-10-04T12:00:00Z'),
  total_amount: 30000,
}))

const EXPENSES = Array.from({ length: 10 }, (_, i) => ({
  property_id: `unit-${i}`,
  amount: 5000,
}))

test.group('buildManagerOverview', () => {
  test('ne compte que les logements affectés', ({ assert }) => {
    const overview = buildManagerOverview({
      scope: SCOPE,
      bookings: BOOKINGS,
      expenses: EXPENSES,
      from: new Date('2026-10-01T00:00:00Z'),
      to: new Date('2026-10-31T23:59:59Z'),
    })

    assert.equal(overview.bookings_count, 6)
    assert.equal(overview.gross_revenue, 180000)
  })

  test('les encaissements des logements non affectés sont absents', ({ assert }) => {
    const overview = buildManagerOverview({
      scope: SCOPE,
      bookings: BOOKINGS,
      expenses: EXPENSES,
      from: new Date('2026-10-01T00:00:00Z'),
      to: new Date('2026-10-31T23:59:59Z'),
    })

    // Les 10 logements totaliseraient 300 000 : le relevé ne doit jamais y toucher.
    assert.notEqual(overview.gross_revenue, 300000)
  })

  test('les dépenses sont cloisonnées de la même façon', ({ assert }) => {
    const overview = buildManagerOverview({
      scope: SCOPE,
      bookings: BOOKINGS,
      expenses: EXPENSES,
      from: new Date('2026-10-01T00:00:00Z'),
      to: new Date('2026-10-31T23:59:59Z'),
    })

    assert.equal(overview.expenses_total, 30000)
  })

  test('le relevé ne porte aucun revenu net', ({ assert }) => {
    const overview = buildManagerOverview({
      scope: SCOPE,
      bookings: BOOKINGS,
      expenses: EXPENSES,
      from: new Date('2026-10-01T00:00:00Z'),
      to: new Date('2026-10-31T23:59:59Z'),
    })

    // Le net déduirait des charges qui ne relèvent pas du gérant — abonnement,
    // charges communes, dépenses d'autres logements. Sur un périmètre partiel
    // ce n'est pas une marge partielle, c'est un chiffre faux.
    assert.notProperty(overview, 'net_revenue')
    assert.notProperty(overview, 'net_income')
  })

  test('un périmètre vide rend un relevé à zéro', ({ assert }) => {
    const overview = buildManagerOverview({
      scope: { ownerId: 'owner-1', actorId: 'gerant-1', propertyIds: [] },
      bookings: BOOKINGS,
      expenses: EXPENSES,
      from: new Date('2026-10-01T00:00:00Z'),
      to: new Date('2026-10-31T23:59:59Z'),
    })

    assert.equal(overview.bookings_count, 0)
    assert.equal(overview.gross_revenue, 0)
  })

  test('le propriétaire obtient le total des 10 logements', ({ assert }) => {
    const overview = buildManagerOverview({
      scope: { ownerId: 'owner-1', actorId: 'owner-1', propertyIds: null },
      bookings: BOOKINGS,
      expenses: EXPENSES,
      from: new Date('2026-10-01T00:00:00Z'),
      to: new Date('2026-10-31T23:59:59Z'),
    })

    assert.equal(overview.gross_revenue, 300000)
  })
})
```

- [ ] **Étape 2 : lancer les tests et vérifier qu'ils échouent**

Lancer : `npm run test`
Attendu : ÉCHEC — `#features/finance/manager_overview` introuvable.

- [ ] **Étape 3 : écrire l'implémentation**

Réutiliser `aggregateRevenuePoints` de
`#features/finance/repositories/finance_repository` plutôt que de recalculer la
répartition mensuelle — elle porte déjà la règle du prorata entre deux mois,
verrouillée par `tests/unit/finance/finance_aggregation.spec.ts`.

```ts
import { aggregateRevenuePoints } from '#features/finance/repositories/finance_repository'
import { filterByScope } from '#features/managers/scope'

import type { ActorScope } from '#features/managers/scope'

interface ScopedBooking {
  property_id?: string | null
  start_date: Date
  end_date: Date
  total_amount: number
}

interface ScopedExpense {
  property_id?: string | null
  amount: number
}

/**
 * Relevé rendu à un gérant.
 *
 * Volontairement sans revenu net : le net déduit des charges qui ne relèvent
 * pas du gérant — abonnement du propriétaire, charges communes, dépenses
 * portées par d'autres logements. Calculé sur un périmètre partiel, il ne
 * donnerait pas une marge partielle mais un chiffre faux.
 */
export interface ManagerOverviewDto {
  bookings_count: number
  gross_revenue: number
  expenses_total: number
  occupancy_rate: number
  revenue_points: { month: string; value: number }[]
}

export function buildManagerOverview(input: {
  scope: ActorScope
  bookings: readonly ScopedBooking[]
  expenses: readonly ScopedExpense[]
  from: Date
  to: Date
}): ManagerOverviewDto {
  const bookings = filterByScope(input.bookings, input.scope)
  const expenses = filterByScope(input.expenses, input.scope)

  const grossRevenue = bookings.reduce((sum, b) => sum + b.total_amount, 0)
  const expensesTotal = expenses.reduce((sum, e) => sum + e.amount, 0)

  return {
    bookings_count: bookings.length,
    gross_revenue: grossRevenue,
    expenses_total: expensesTotal,
    occupancy_rate: computeOccupancyRate(bookings, input.scope, input.from, input.to),
    revenue_points: aggregateRevenuePoints(bookings, {}),
  }
}
```

Écrire `computeOccupancyRate` dans le même fichier : jours occupés sur la
période divisés par (nombre de logements du périmètre × jours de la période).
Rendre `0` lorsque le dénominateur est nul — un périmètre vide ou une période
d'un jour ne doivent pas produire de division par zéro.

- [ ] **Étape 4 : lancer les tests et vérifier qu'ils passent**

Lancer : `npm run test`
Attendu : SUCCÈS, 6 tests de plus, et les suites `finance` existantes intactes.

- [ ] **Étape 5 : commit**

```bash
git add app/features/finance/manager_overview.ts tests/unit/finance/manager_overview.spec.ts
git commit -m "feat(finance): cloisonner le releve d'un gerant sur ses logements"
```

---

## Task 7 : gestion des gérants côté propriétaire

**Fichiers :**
- Créer : `app/features/managers/dto/manager.dto.ts`
- Créer : `app/features/managers/repositories/manager_repository.ts`
- Créer : `app/features/managers/use_cases/create_manager.use_case.ts`
- Créer : `app/features/managers/use_cases/list_managers.use_case.ts`
- Créer : `app/features/managers/use_cases/update_manager_properties.use_case.ts`
- Créer : `app/features/managers/use_cases/set_manager_status.use_case.ts`
- Créer : `app/validators/managers/manager_validator.ts`
- Créer : `app/controllers/proprio/manager_controller.ts`
- Modifier : `start/routes.ts` (groupe `proprio`)
- Test : `tests/unit/managers/create_manager.spec.ts`

**Interfaces consommées :**
- `ManagerAssignment`, `normalizePropertyIds` (Task 2)
- `User.create`, `User.findOne` (existants)

**Interfaces produites :**
```ts
export interface ManagerDto {
  _id: string
  full_name: string
  email: string | null
  phone: string | null
  is_active: boolean
  property_ids: string[]
  created_at: Date
}
export function assertPropertiesOwned(
  properties: readonly { _id: string; owner_id: string }[],
  requestedIds: readonly string[],
  ownerId: string
): void
```

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import { test } from '@japa/runner'

import { assertPropertiesOwned } from '#features/managers/use_cases/create_manager.use_case'
import { DomainError } from '#utils/domain_error'

const OWNED = [
  { _id: 'studio-1', owner_id: 'owner-1' },
  { _id: 'studio-2', owner_id: 'owner-1' },
]

test.group('assertPropertiesOwned', () => {
  test('laisse passer des logements du propriétaire', ({ assert }) => {
    assert.doesNotThrows(() => assertPropertiesOwned(OWNED, ['studio-1'], 'owner-1'))
  })

  test('refuse un logement appartenant à un autre propriétaire', ({ assert }) => {
    try {
      assertPropertiesOwned(OWNED, ['studio-1', 'studio-9'], 'owner-1')
      assert.fail('aurait dû lever')
    } catch (error) {
      assert.instanceOf(error, DomainError)
      assert.equal((error as DomainError).code, 'property_not_owned')
      assert.equal((error as DomainError).status, 422)
    }
  })

  test('accepte une affectation vide', ({ assert }) => {
    // Un gérant créé sans logement est légitime : le propriétaire lui en
    // attribuera ensuite. Il ne voit alors rien, ce que garantit `filterByScope`.
    assert.doesNotThrows(() => assertPropertiesOwned(OWNED, [], 'owner-1'))
  })
})
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

Lancer : `npm run test`
Attendu : ÉCHEC — module introuvable.

- [ ] **Étape 3 : écrire le use case de création**

```ts
import Role from '#models/role'
import User from '#models/user'
import ManagerAssignment, { normalizePropertyIds } from '#models/manager_assignment'
import { DomainError } from '#utils/domain_error'

/**
 * Tous les logements demandés appartiennent-ils bien au propriétaire ?
 *
 * Sans ce contrôle, un identifiant deviné suffirait à s'affecter le logement
 * d'autrui — même garde que `findByIdAndOwner` sur les résidences.
 */
export function assertPropertiesOwned(
  properties: readonly { _id: string; owner_id: string }[],
  requestedIds: readonly string[],
  ownerId: string
): void {
  const owned = new Set(properties.filter((p) => p.owner_id === ownerId).map((p) => p._id))
  const foreign = requestedIds.filter((id) => !owned.has(id))

  if (foreign.length > 0) {
    throw new DomainError(
      'property_not_owned',
      "Un des logements sélectionnés ne vous appartient pas.",
      422
    )
  }
}
```

Puis `CreateManagerUseCase`, qui enchaîne :

1. Normaliser les identifiants demandés (`normalizePropertyIds`).
2. Charger les logements du propriétaire et appeler `assertPropertiesOwned`.
3. Vérifier qu'aucun compte n'existe déjà avec cet e-mail ou ce téléphone —
   `User.findOne` lève sinon un `Error` brut, à convertir en
   `DomainError('manager_already_exists', ..., 409)`.
4. Hacher le mot de passe initial avec le service déjà employé par
   l'inscription. Le repérer par
   `grep -rn "hash\|bcrypt" app/controllers/auth/auth_controller.ts`.
5. `User.create` avec `role_id: 'gerant'`, `is_verified: true`,
   `metadata.created_by: ownerId`.

   Pas d'OTP : le propriétaire enregistre une personne qu'il connaît et dont il
   a vérifié le numéro. Commenter ce choix.
6. `ManagerAssignment.upsert` avec le périmètre.
7. Rendre un `ManagerDto` — **sans le mot de passe**.

- [ ] **Étape 4 : écrire le validator**

```ts
import vine from '@vinejs/vine'

export const createManagerValidator = vine.compile(
  vine.object({
    full_name: vine.string().trim().minLength(2).maxLength(120),
    email: vine.string().trim().email().optional(),
    phone: vine.string().trim().minLength(8).maxLength(20).optional(),
    password: vine.string().minLength(8).maxLength(72),
    property_ids: vine.array(vine.string().trim()).distinct(),
  })
)

export const updateManagerPropertiesValidator = vine.compile(
  vine.object({
    property_ids: vine.array(vine.string().trim()).distinct(),
  })
)

export const setManagerStatusValidator = vine.compile(
  vine.object({
    is_active: vine.boolean(),
  })
)
```

Ajouter une règle exigeant qu'au moins l'un de `email` ou `phone` soit fourni —
sans quoi le gérant n'aurait aucun moyen de se connecter.

- [ ] **Étape 5 : écrire le contrôleur et les routes**

`app/controllers/proprio/manager_controller.ts` : contrôleur fin — il lit
`ctx.authUser.id`, valide, appelle le use case, renvoie `{ data }`.

Dans `start/routes.ts`, à l'intérieur du groupe `proprio` existant :

```ts
        router
          .group(() => {
            router.get('/', [ProprioManagerController, 'index'])
            router.post('/', [ProprioManagerController, 'store'])
            router.get(':id', [ProprioManagerController, 'show'])
            router.put(':id/properties', [ProprioManagerController, 'replaceProperties'])
            router.patch(':id/status', [ProprioManagerController, 'setStatus'])
          })
          .prefix('managers')
          .as('managers')
```

Déclarer l'import paresseux en tête de fichier, sur le modèle des autres :

```ts
const ProprioManagerController = () => import('#controllers/proprio/manager_controller')
```

- [ ] **Étape 6 : lancer toute la suite**

Lancer : `npm run test && npm run typecheck && npm run lint`

- [ ] **Étape 7 : commit**

```bash
git add app/features/managers app/validators/managers app/controllers/proprio/manager_controller.ts start/routes.ts tests/unit/managers/create_manager.spec.ts
git commit -m "feat(managers): creation et affectation d'un gerant par le proprietaire"
```

---

## Task 8 : routes gérant

**Fichiers :**
- Créer : `app/controllers/gerant/booking_controller.ts`
- Créer : `app/controllers/gerant/client_controller.ts`
- Créer : `app/controllers/gerant/expense_controller.ts`
- Créer : `app/controllers/gerant/property_controller.ts`
- Créer : `app/controllers/gerant/residence_controller.ts`
- Créer : `app/controllers/gerant/finance_controller.ts`
- Créer : `app/controllers/gerant/profile_controller.ts`
- Modifier : `start/routes.ts`

**Interfaces consommées :** `ctx.scope` (Task 3), les use cases `proprio`
existants, `buildManagerOverview` (Task 6).

**Interfaces produites :** les routes listées dans la spec, section « Contrat
API ».

- [ ] **Étape 1 : écrire les contrôleurs**

Chacun réutilise le use case `proprio` correspondant, en lui passant
`ctx.scope.ownerId` et `ctx.scope.propertyIds` au lieu du seul `authUser.id`.
Dupliquer les use cases dupliquerait la règle métier, qui divergerait.

Aux écritures, renseigner `created_by: ctx.scope.actorId`.

Aux accès à une ressource nommément désignée, appeler `assertWithinScope` avant
toute modification — l'identifiant venant du client, la garde est nécessaire.

- [ ] **Étape 2 : cas particulier du carnet clients**

`GET /gerant/clients` ne rend pas tout le carnet : les clients sont cloisonnés
par `owner_id` et non par logement, si bien qu'une lecture naïve donnerait au
gérant toute la clientèle du propriétaire.

Retenir un client lorsqu'il a au moins une réservation sur un logement du
périmètre **ou** que son `created_by` est le gérant qui interroge. La seconde
branche est nécessaire : un client tout juste créé au comptoir n'a encore
aucune réservation et disparaîtrait de la liste entre sa création et la
réservation qu'il sert.

- [ ] **Étape 3 : cas particulier des résidences**

`GET /gerant/residences` est un regroupement d'affichage : rendre les
résidences contenant au moins un logement du périmètre, et n'y exposer que ces
logements. Recalculer le nombre d'unités sur le périmètre — le champ
dénormalisé `units_count` compte les 10 logements et trahirait l'existence des
4 autres.

- [ ] **Étape 4 : déclarer les routes**

```ts
    router
      .group(() => {
        // ... groupes properties, bookings, clients, expenses, finance, profile
      })
      .prefix('gerant')
      .as('gerant')
      .use([middleware.auth(), middleware.role(['gerant']), middleware.scope()])
```

Reprendre la liste exacte de la section « Contrat API » de la spec. Ce qui n'y
figure pas est fermé par construction.

Placer les routes littérales avant les routes paramétrées — `availability`
avant `:id` —, sinon le littéral est pris pour un identifiant.

- [ ] **Étape 5 : verrouiller l'arbitrage fondateur**

Écrire `tests/unit/managers/write_attribution.spec.ts`. Une donnée créée par un
gérant appartient au **propriétaire** : c'est ce qui préserve la vue globale de
ce dernier et évite toute migration. Le test porte sur la fonction pure qui
construit la charge utile, pas sur l'écriture Firestore.

```ts
import { test } from '@japa/runner'

import { buildScopedWrite } from '#features/managers/scope'

import type { ActorScope } from '#features/managers/scope'

const MANAGER: ActorScope = {
  ownerId: 'owner-1',
  actorId: 'gerant-1',
  propertyIds: ['studio-1'],
}

const OWNER: ActorScope = { ownerId: 'owner-1', actorId: 'owner-1', propertyIds: null }

test.group('buildScopedWrite', () => {
  test('une saisie de gérant appartient au propriétaire', ({ assert }) => {
    const payload = buildScopedWrite({ property_id: 'studio-1' }, MANAGER)

    assert.equal(payload.owner_id, 'owner-1')
  })

  test('une saisie de gérant porte son auteur réel', ({ assert }) => {
    const payload = buildScopedWrite({ property_id: 'studio-1' }, MANAGER)

    assert.equal(payload.created_by, 'gerant-1')
  })

  test('une saisie du propriétaire ne porte pas d’auteur distinct', ({ assert }) => {
    const payload = buildScopedWrite({ property_id: 'studio-1' }, OWNER)

    assert.equal(payload.owner_id, 'owner-1')
    assert.isNull(payload.created_by)
  })

  test('une saisie hors périmètre est refusée', ({ assert }) => {
    assert.throws(() => buildScopedWrite({ property_id: 'studio-9' }, MANAGER))
  })
})
```

Implémenter dans `app/features/managers/scope.ts` :

```ts
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
```

Les contrôleurs `gerant/` construisent leurs écritures avec cette fonction
plutôt qu'en recopiant `owner_id` à la main : la garde de périmètre devient
impossible à oublier.

- [ ] **Étape 6 : lancer toute la suite**

Lancer : `npm run test && npm run typecheck && npm run lint`

- [ ] **Étape 7 : commit**

```bash
git add app/controllers/gerant app/features/managers/scope.ts start/routes.ts tests/unit/managers/write_attribution.spec.ts
git commit -m "feat(managers): routes gerant sur le perimetre affecte"
```

---

## Task 9 : index Firestore

**Fichiers :**
- Modifier : `firestore.indexes.json`

- [ ] **Étape 1 : recenser les requêtes composites introduites**

`manager_assignments` : `owner_id` + `created_at desc`.

Les requêtes `owner_id` + `property_id in` + `orderBy` sur `bookings` et
`expenses` exigent chacune un index composite. Un index manquant est traité par
le handler d'exceptions comme un défaut de déploiement, pas comme une erreur
métier — il faut donc les déclarer avant mise en service.

- [ ] **Étape 2 : ajouter les entrées**

```json
{
  "collectionGroup": "manager_assignments",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "owner_id", "order": "ASCENDING" },
    { "fieldPath": "created_at", "order": "DESCENDING" }
  ]
}
```

Ajouter de même les composites `bookings` et `expenses` relevés à l'étape 1, en
suivant la forme des entrées déjà présentes dans le fichier.

- [ ] **Étape 3 : commit**

```bash
git add firestore.indexes.json
git commit -m "chore(managers): index firestore du perimetre gerant"
```

---

## Portée de ce plan

Ce plan couvre **l'API seule**. Le mobile — `GerantShell`, `basePathForRole`,
écran de création d'un gérant, traitement d'`out_of_scope` à la synchronisation
— fait l'objet d'un plan distinct, dans le dépôt `mobile/`, une fois le contrat
API en place et vérifiable.

Les deux dépôts étant indépendants, commiter séparément dans `api/` et
`mobile/`, jamais depuis la racine.
