# App client lot 1 — volet API — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre l'API prête pour l'app client : failles d'inscription fermées, routes de réservation client authentifiées, disponibilité publique, retour et confirmation du paiement Wave, historique client exploitable.

**Architecture:** Modifications dans le découpage existant par feature (`auth`, `bookings`, `booking_payments`, `properties`). Chaque règle nouvelle vit dans un use case à dépendances injectées, testé en unitaire avec des doublures — l'API n'a pas de suite fonctionnelle (pas d'émulateur Firestore), les routes se vérifient à la main.

**Tech Stack:** AdonisJS 7, TypeScript, VineJS, Firestore, Japa (suite `unit`).

**Spec:** `api/docs/superpowers/specs/2026-10-08-app-client-lot1-design.md`

## Global Constraints

- Messages d'erreur, commentaires et commits en français ; identifiants en anglais.
- Toute violation métier lève `DomainError(code, message, status)` ; jamais de `throw new Error()` brut depuis un use case.
- Validation par `ctx.request.validateUsing(...)`, jamais `request.body()` lu directement (exception : le webhook, qui a besoin du corps brut).
- Imports par alias `#features/*`, `#models/*`, `#services/*`, `#validators/*`, `#utils/*`.
- Une route littérale précède une route paramétrée.
- Champs JSON en `snake_case`.
- Les tests unitaires ne contactent pas Firebase.
- Commits conventionnels en français, sans majuscule initiale, **uniquement si l'utilisateur l'a demandé** (CLAUDE.md : « Ne commiter et ne pousser que sur demande explicite »).
- Aucun DTO existant ne change de forme ; les ajouts sont des champs optionnels.

## Écarts assumés par rapport à la spec

Relevés en préparant ce plan ; à signaler à l'utilisateur.

1. **Tests de routes.** La spec prévoyait des tests fonctionnels (401/403, page de retour). L'API n'a pas de suite `functional` ni d'émulateur : la logique est testée en unitaire, les routes vérifiées à la main (Task 7).
2. **Route de retour par réservation.** `GET /payments/wave/bookings/:booking_id/return` plutôt que `:reference` : le dernier paiement en attente d'une réservation se retrouve déjà (`findPendingByBooking`), sans nouvelle requête.
3. **Rôle des comptes Google.** `GoogleLoginUseCase` crée tout nouveau compte en `proprio`. Ajout d'un `role_name` optionnel (`proprio` | `client`, défaut `proprio`) sur `POST /auth/google`, lu à la création seulement.
4. **Historique client.** La liste `GET /client/bookings` ne joint ni le bien ni l'état du paiement : l'app n'aurait qu'un identifiant à afficher. Ajout des champs optionnels `property` (résumé existant `BookingPropertySummary`) et `payment_status`.

## Review Focus

- Un compte Google **existant** (`proprio`) qui se connecte depuis l'app client avec `role_name: "client"` : son rôle ne doit pas changer (Task 2).
- `confirm` appelé pour la réservation d'un autre client : 404 identique à une réservation inconnue (Task 5).
- Session Wave payée mais montant divergent : paiement clos `failed` (`amount_mismatch`), jamais `success` (Task 5).
- Disponibilité d'une résidence non publiée ou privée : 404, aucune période renvoyée (Task 4).
- Réservation annulée dans la disponibilité : ne bloque pas la période (Task 4).

---

### Task 1 : refuser l'inscription en administrateur

**Files:**
- Modify: `api/app/validators/auth/auth.ts` (`registerInitValidator`)
- Test: `api/tests/unit/users/register_role.spec.ts`

**Interfaces:**
- Produces: `registerInitValidator` n'accepte plus que `role_name` ∈ `proprio`, `client`.

- [ ] **Step 1 : écrire le test qui échoue**

```ts
import { test } from '@japa/runner'
import { errors } from '@vinejs/vine'

import { registerInitValidator } from '#validators/auth/auth'

const base = {
  full_name: 'Awa Koné',
  auth_channel: 'email',
  email: 'awa@example.com',
  password: 'motdepasse1',
  password_confirmation: 'motdepasse1',
}

test.group('registerInitValidator — rôle', () => {
  test('refuse role_name admin', async ({ assert }) => {
    await assert.rejects(
      () => registerInitValidator.validate({ ...base, role_name: 'admin' }),
      errors.E_VALIDATION_ERROR
    )
  })

  test('accepte client et proprio', async ({ assert }) => {
    const client = await registerInitValidator.validate({ ...base, role_name: 'client' })
    const proprio = await registerInitValidator.validate({ ...base, role_name: 'proprio' })
    assert.equal(client.role_name, 'client')
    assert.equal(proprio.role_name, 'proprio')
  })
})
```

- [ ] **Step 2 : vérifier l'échec**

Run: `cd api && node ace test unit --files=tests/unit/users/register_role.spec.ts`
Expected: FAIL sur « refuse role_name admin » (la validation réussit).

- [ ] **Step 3 : corriger le validateur**

Dans `registerInitValidator`, remplacer la ligne `role_name` et la commenter :

```ts
    // `admin` absent à dessein : la route est publique, et l'accepter laissait
    // n'importe qui se créer un compte administrateur. Les administrateurs
    // naissent de `BOOTSTRAP_ADMINS` ou de `node ace admin:create`.
    role_name: vine.enum(['proprio', 'client'] as const),
```

- [ ] **Step 4 : vérifier le succès**

Run: `cd api && node ace test unit --files=tests/unit/users/register_role.spec.ts`
Expected: PASS (2 tests). Puis `npm run typecheck` : aucune erreur (le type `role_name` se resserre ; si `RegisterInitInput` déclare `'admin'`, le laisser, il reste compatible).

- [ ] **Step 5 : commit (sur demande)**

```bash
git add app/validators/auth/auth.ts tests/unit/users/register_role.spec.ts
git commit -m "fix(auth): refuser l'inscription publique en administrateur"
```

---

### Task 2 : rôle d'un compte créé par Google

**Files:**
- Modify: `api/app/validators/auth/auth.ts` (`googleLoginValidator`)
- Modify: `api/app/auth/dto/index.ts` (`GoogleLoginInput`)
- Modify: `api/app/controllers/auth/auth_controller.ts` (`google`)
- Modify: `api/app/auth/use_cases/auth/google_login.use_case.ts`
- Test: `api/tests/unit/users/google_signup_role.spec.ts`

**Interfaces:**
- Produces: `POST /auth/google` accepte `role_name?: 'proprio' | 'client'` ; `export function googleSignupRole(requested?: 'proprio' | 'client'): 'proprio' | 'client'` dans `google_login.use_case.ts`.

- [ ] **Step 1 : écrire le test qui échoue**

```ts
import { test } from '@japa/runner'
import { errors } from '@vinejs/vine'

import { googleSignupRole } from '#auth/use_cases/auth/google_login.use_case'
import { googleLoginValidator } from '#validators/auth/auth'

const idToken = 'x'.repeat(40)

test.group('Connexion Google — rôle à la création', () => {
  test('sans rôle demandé, le compte naît propriétaire', ({ assert }) => {
    // Comportement historique de l'application propriétaire, qui n'envoie rien.
    assert.equal(googleSignupRole(undefined), 'proprio')
  })

  test('l’app client obtient un compte client', ({ assert }) => {
    assert.equal(googleSignupRole('client'), 'client')
  })

  test('le validateur refuse admin', async ({ assert }) => {
    await assert.rejects(
      () => googleLoginValidator.validate({ id_token: idToken, role_name: 'admin' }),
      errors.E_VALIDATION_ERROR
    )
  })

  test('le validateur accepte l’absence de rôle', async ({ assert }) => {
    const payload = await googleLoginValidator.validate({ id_token: idToken })
    assert.isUndefined(payload.role_name)
  })
})
```

- [ ] **Step 2 : vérifier l'échec**

Run: `cd api && node ace test unit --files=tests/unit/users/google_signup_role.spec.ts`
Expected: FAIL — `googleSignupRole` n'est pas exporté.

- [ ] **Step 3 : implémenter**

`app/validators/auth/auth.ts`, dans `googleLoginValidator` :

```ts
export const googleLoginValidator = vine.compile(
  vine.object({
    id_token: vine.string().trim().minLength(20).maxLength(4096),
    // Lu à la création du compte seulement : un compte existant garde son
    // rôle, sinon une connexion depuis l'app client changerait un
    // propriétaire en client. Absent pour l'application propriétaire.
    role_name: vine.enum(['proprio', 'client'] as const).optional(),
  })
)
```

`app/auth/dto/index.ts`, dans `GoogleLoginInput` :

```ts
export interface GoogleLoginInput {
  id_token: string
  device: DeviceContext
  /** Rôle d'un compte créé à cette connexion. Ignoré pour un compte existant. */
  role_name?: 'proprio' | 'client'
}
```

`app/controllers/auth/auth_controller.ts`, méthode `google` :

```ts
  async google(ctx: HttpContext) {
    const { id_token: idToken, role_name: roleName } =
      await ctx.request.validateUsing(googleLoginValidator)
    const device = getDeviceContext(ctx)
    const result = await new GoogleLoginUseCase().execute({
      id_token: idToken,
      device,
      role_name: roleName,
    })

    return result.is_new_user ? ctx.response.created(result) : ctx.response.ok(result)
  }
```

`app/auth/use_cases/auth/google_login.use_case.ts` : remplacer la constante par la fonction exportée, juste sous les imports :

```ts
/**
 * Rôle d'un compte créé par Google.
 *
 * `proprio` par défaut : l'application propriétaire, premier client de cette
 * route, n'envoie aucun rôle et doit continuer d'obtenir un compte
 * propriétaire.
 */
export function googleSignupRole(requested?: 'proprio' | 'client'): 'proprio' | 'client' {
  return requested ?? 'proprio'
}
```

Dans `createAndSignIn`, remplacer la recherche du rôle et l'ouverture d'essai :

```ts
    const roleName = googleSignupRole(input.role_name)
    const role = await Role.findOne({ name: roleName })
    if (!role) {
      throw new AuthError('role_not_found', `Le rôle "${roleName}" n'existe pas.`, 500)
    }
```

et, plus bas :

```ts
    // L'essai gratuit est un avantage du propriétaire : un client n'a pas
    // d'abonnement.
    if (roleName === 'proprio') await this.startTrial(user._id)
```

Supprimer `DEFAULT_GOOGLE_ROLE` s'il n'a plus d'usage (`grep -n DEFAULT_GOOGLE_ROLE`).

- [ ] **Step 4 : vérifier**

Run: `cd api && node ace test unit --files=tests/unit/users/google_signup_role.spec.ts && npm run typecheck`
Expected: PASS (4 tests), typecheck sans erreur.

- [ ] **Step 5 : commit (sur demande)**

```bash
git add app/validators/auth/auth.ts app/auth/dto/index.ts app/controllers/auth/auth_controller.ts app/auth/use_cases/auth/google_login.use_case.ts tests/unit/users/google_signup_role.spec.ts
git commit -m "feat(auth): role client pour un compte cree par google"
```

---

### Task 3 : authentifier les réservations client

**Files:**
- Modify: `api/start/routes.ts` (groupe `client`, ~l. 471-498)

**Interfaces:**
- Produces: `GET|PATCH /api/v1/client/bookings/*` et `POST /api/v1/client/properties/:property_id/bookings` exigent un jeton de rôle `client` ; `GET /api/v1/client/properties*` reste public.

- [ ] **Step 1 : réécrire le groupe client**

Remplacer le bloc `router.group(() => { … }).prefix('client').as('client')` par :

```ts
    router
      .group(() => {
        // Public : on parcourt les résidences sans compte, la connexion n'est
        // exigée qu'au moment de réserver.
        router
          .group(() => {
            router.get('/', [ClientPropertyController, 'index'])
            router.get('search', [ClientPropertyController, 'search'])
            router.get('featured', [ClientPropertyController, 'featured'])
            router.get(':id/availability', [ClientPropertyController, 'availability'])
            router.get(':id', [ClientPropertyController, 'show'])
          })
          .prefix('properties')
          .as('properties')

        // Le groupe n'avait aucun middleware : `ctx.authUser` restait vide et
        // chaque appel rendait 401, connecté ou non.
        router
          .group(() => {
            router.post('properties/:property_id/bookings', [ClientBookingController, 'store'])
            router
              .group(() => {
                router.get('/', [ClientBookingController, 'index'])
                router.patch(':id', [ClientBookingController, 'update'])
                router.patch(':id/cancel', [ClientBookingController, 'cancel'])
                router.post(':id/payments/wave/init', [
                  ClientBookingPaymentController,
                  'initializeWave',
                ])
                router.post(':id/payments/wave/confirm', [
                  ClientBookingPaymentController,
                  'confirmWave',
                ])
              })
              .prefix('bookings')
              .as('bookings')
          })
          .use([middleware.auth(), middleware.role(['client'])])
      })
      .prefix('client')
      .as('client')
```

`availability` et `confirmWave` sont implémentés aux Tasks 4 et 5 ; jusque-là `npm run typecheck` signale leur absence — enchaîner les Tasks 3 à 5 avant de vérifier.

- [ ] **Step 2 : vérifier les noms de routes**

Run: `cd api && node ace list:routes | grep "client\."`
Expected: `client.properties.*` sans middleware, `client.bookings.*` et la création avec `auth`, `role`.

- [ ] **Step 3 : commit (sur demande, après les Tasks 4 et 5)**

---

### Task 4 : disponibilité publique d'une résidence

**Files:**
- Create: `api/app/features/bookings/use_cases/get_public_availability.use_case.ts`
- Modify: `api/app/features/bookings/use_cases/index.ts` (export)
- Modify: `api/app/controllers/client/property_controller.ts` (`availability`)
- Test: `api/tests/unit/bookings/public_availability.spec.ts`

**Interfaces:**
- Produces: `GetPublicAvailabilityUseCase.execute(propertyId: string, from?: Date): Promise<PublicPeriodDto[]>` avec `interface PublicPeriodDto { start: Date; end: Date }` ; route `GET /client/properties/:id/availability` → `{ data: PublicPeriodDto[] }`.

- [ ] **Step 1 : écrire le test qui échoue**

```ts
import { test } from '@japa/runner'

import { GetPublicAvailabilityUseCase } from '#features/bookings/use_cases/get_public_availability.use_case'

const d = (iso: string) => new Date(iso)

function useCase(property: Record<string, unknown> | null, bookings: Array<Record<string, unknown>>) {
  return new GetPublicAvailabilityUseCase({
    findProperty: async () => property as never,
    findActiveBookings: async () => bookings as never,
  })
}

const published = { status: 'published', visibility: { is_public: true } }

test.group('GetPublicAvailabilityUseCase', () => {
  test('rend les périodes actives, sans identité', async ({ assert }) => {
    const periods = await useCase(published, [
      {
        _id: 'b1',
        status: 'confirmed',
        start_date: d('2026-10-10T12:00:00Z'),
        end_date: d('2026-10-12T12:00:00Z'),
        client_snapshot: { full_name: 'Awa Koné' },
      },
    ]).execute('p1', d('2026-10-01T00:00:00Z'))

    assert.deepEqual(periods, [{ start: d('2026-10-10T12:00:00Z'), end: d('2026-10-12T12:00:00Z') }])
  })

  test('ignore une réservation annulée', async ({ assert }) => {
    const periods = await useCase(published, [
      { status: 'cancelled', start_date: d('2026-10-10T12:00:00Z'), end_date: d('2026-10-12T12:00:00Z') },
    ]).execute('p1')

    assert.deepEqual(periods, [])
  })

  test('préfère les heures d’arrivée et de sortie quand elles existent', async ({ assert }) => {
    const periods = await useCase(published, [
      {
        status: 'in_progress',
        start_date: d('2026-10-10T00:00:00Z'),
        end_date: d('2026-10-12T00:00:00Z'),
        check_in_at: d('2026-10-10T12:00:00Z'),
        check_out_at: d('2026-10-12T12:00:00Z'),
      },
    ]).execute('p1')

    assert.deepEqual(periods, [{ start: d('2026-10-10T12:00:00Z'), end: d('2026-10-12T12:00:00Z') }])
  })

  test('404 pour une résidence non publiée', async ({ assert }) => {
    await assert.rejects(
      () => useCase({ status: 'draft', visibility: { is_public: true } }, []).execute('p1'),
      'Résidence introuvable.'
    )
  })

  test('404 pour une résidence inconnue', async ({ assert }) => {
    await assert.rejects(() => useCase(null, []).execute('p1'), 'Résidence introuvable.')
  })
})
```

- [ ] **Step 2 : vérifier l'échec**

Run: `cd api && node ace test unit --files=tests/unit/bookings/public_availability.spec.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3 : implémenter le use case**

```ts
import Booking from '#models/booking'
import Property from '#models/property'
import { DomainError } from '#utils/domain_error'

import { ACTIVE_BOOKING_STATUSES, toPeriods } from '../availability.ts'

export interface PublicPeriodDto {
  start: Date
  end: Date
}

/** Lectures du use case, injectables pour les tests unitaires. */
export interface PublicAvailabilitySources {
  findProperty(
    id: string
  ): Promise<{ status: string; visibility?: { is_public?: boolean } } | null>
  findActiveBookings(
    propertyId: string,
    from: Date
  ): Promise<
    Array<{
      _id?: string
      status: string
      start_date: Date
      end_date: Date
      check_in_at?: Date
      check_out_at?: Date
    }>
  >
}

const defaultSources: PublicAvailabilitySources = {
  findProperty: (id) => Property.findById(id),
  findActiveBookings: (propertyId, from) => Booking.findActiveForProperty(propertyId, from),
}

/**
 * Périodes occupées d'une résidence publiée, pour barrer les dates du
 * calendrier de l'app client.
 *
 * Réduites à leurs bornes : la route est publique, et ni l'identifiant d'une
 * réservation ni le nom de son client n'ont à en sortir.
 */
export class GetPublicAvailabilityUseCase {
  constructor(private sources: PublicAvailabilitySources = defaultSources) {}

  async execute(propertyId: string, from: Date = new Date()): Promise<PublicPeriodDto[]> {
    const property = await this.sources.findProperty(propertyId)
    // Même réponse pour une résidence inconnue et pour une résidence non
    // publiée : la distinguer révélerait l'existence d'un brouillon.
    if (!property || property.status !== 'published' || property.visibility?.is_public === false) {
      throw new DomainError('property_not_found', 'Résidence introuvable.', 404)
    }

    const blocking = ACTIVE_BOOKING_STATUSES as readonly string[]
    const bookings = await this.sources.findActiveBookings(propertyId, from)

    return toPeriods(bookings)
      .filter((period) => blocking.includes(period.status))
      .map((period) => ({ start: period.check_in_at, end: period.check_out_at }))
      .sort((a, b) => a.start.getTime() - b.start.getTime())
  }
}

export default GetPublicAvailabilityUseCase
```

Vérifier que `Property.findById` existe (`grep -n "findById" app/models/property.ts`) ; sinon passer par `new PropertyRepository().findById(id)` qui rend un `PropertyDto` portant `status` et `visibility`.

Ajouter l'export dans `app/features/bookings/use_cases/index.ts`, sur le modèle des lignes existantes :

```ts
export { GetPublicAvailabilityUseCase } from './get_public_availability.use_case.ts'
```

- [ ] **Step 4 : brancher le contrôleur**

`app/controllers/client/property_controller.ts` :

```ts
import { GetPublicAvailabilityUseCase } from '../../features/bookings/use_cases/index.ts'

  async availability(ctx: HttpContext) {
    const periods = await new GetPublicAvailabilityUseCase().execute(ctx.params.id)
    return ctx.response.ok({ data: periods })
  }
```

- [ ] **Step 5 : vérifier**

Run: `cd api && node ace test unit --files=tests/unit/bookings/public_availability.spec.ts`
Expected: PASS (5 tests).

---

### Task 5 : confirmation du paiement Wave d'une réservation

**Files:**
- Create: `api/app/features/booking_payments/use_cases/confirm_booking_payment.use_case.ts`
- Modify: `api/app/features/booking_payments/use_cases/index.ts`
- Modify: `api/app/features/booking_payments/use_cases/initialize_booking_payment.use_case.ts` (URLs de retour)
- Modify: `api/app/controllers/client/booking_payment_controller.ts` (`confirmWave`, `waveReturn`, webhook sur corps brut)
- Modify: `api/start/routes.ts` (route de retour)
- Test: `api/tests/unit/booking_payments/confirm_booking_payment.spec.ts`

**Interfaces:**
- Consumes: `WaveSubscriptionService.getCheckoutSession(id): Promise<WaveCheckoutSession | null>` (même clé `WAVE_API_KEY`), `isPaymentConsistent` de `#features/subscriptions/subscription_checkout`, `BookingPaymentRepository.findPendingByBooking`, `updateStatus`.
- Produces: `ConfirmBookingPaymentUseCase.execute(bookingId: string, clientId: string): Promise<BookingPaymentDto>` ; `executeForBooking(bookingId: string): Promise<BookingPaymentDto | null>` ; routes `POST /client/bookings/:id/payments/wave/confirm` → `{ data: BookingPaymentDto }`, `GET /payments/wave/bookings/:booking_id/return` → page HTML.

- [ ] **Step 1 : écrire le test qui échoue**

```ts
import { test } from '@japa/runner'

import { ConfirmBookingPaymentUseCase } from '#features/booking_payments/use_cases/confirm_booking_payment.use_case'

const pending = {
  id: 'BOOKING-b1-uuid',
  booking_id: 'b1',
  client_id: 'c1',
  amount: 80000,
  currency: 'XOF',
  status: 'pending',
  provider_checkout_id: 'cos-1',
  transaction_reference: 'BOOKING-b1-uuid',
}

function useCase(options: {
  booking?: { client_id: string } | null
  payment?: Record<string, unknown> | null
  session?: Record<string, unknown> | null
}) {
  const updates: Array<{ status: string; data: Record<string, unknown> }> = []
  const confirm = new ConfirmBookingPaymentUseCase(
    { findById: async () => (options.booking === undefined ? { client_id: 'c1' } : options.booking) } as never,
    {
      findPendingByBooking: async () => (options.payment === undefined ? pending : options.payment),
      updateStatus: async (_id: string, status: string, data: Record<string, unknown>) => {
        updates.push({ status, data })
        return { ...pending, status }
      },
    } as never,
    { getCheckoutSession: async () => options.session ?? null } as never
  )
  return { confirm, updates }
}

const paid = {
  id: 'cos-1',
  amount: '80000',
  currency: 'XOF',
  checkout_status: 'complete',
  payment_status: 'succeeded',
  client_reference: 'BOOKING-b1-uuid',
  transaction_id: 'T-1',
}

test.group('ConfirmBookingPaymentUseCase', () => {
  test('constate un paiement réussi', async ({ assert }) => {
    const { confirm, updates } = useCase({ session: paid })
    const payment = await confirm.execute('b1', 'c1')

    assert.equal(payment.status, 'success')
    assert.equal(updates[0].status, 'success')
    assert.equal(updates[0].data.provider_transaction_id, 'T-1')
  })

  test('montant divergent : échec, jamais succès', async ({ assert }) => {
    const { confirm, updates } = useCase({ session: { ...paid, amount: '1000' } })
    const payment = await confirm.execute('b1', 'c1')

    assert.equal(payment.status, 'failed')
    assert.equal(updates[0].data.failure_reason, 'amount_mismatch')
  })

  test('session expirée : paiement expiré', async ({ assert }) => {
    const { confirm } = useCase({
      session: { ...paid, checkout_status: 'expired', payment_status: 'processing' },
    })
    assert.equal((await confirm.execute('b1', 'c1')).status, 'expired')
  })

  test('session encore ouverte : rien ne change', async ({ assert }) => {
    const { confirm, updates } = useCase({
      session: { ...paid, checkout_status: 'open', payment_status: 'processing' },
    })
    assert.equal((await confirm.execute('b1', 'c1')).status, 'pending')
    assert.lengthOf(updates, 0)
  })

  test('réservation d’un autre client : 404', async ({ assert }) => {
    const { confirm } = useCase({ booking: { client_id: 'autre' } })
    await assert.rejects(() => confirm.execute('b1', 'c1'), 'Réservation introuvable.')
  })

  test('aucun paiement en attente : 404', async ({ assert }) => {
    const { confirm } = useCase({ payment: null })
    await assert.rejects(() => confirm.execute('b1', 'c1'), 'Paiement introuvable.')
  })
})
```

Le cas « aucun paiement en attente » couvre aussi un paiement déjà constaté : `findPendingByBooking` ne le rend plus. Pour l'idempotence côté app, le client relit alors sa réservation (`payment_status`, Task 6).

- [ ] **Step 2 : vérifier l'échec**

Run: `cd api && node ace test unit --files=tests/unit/booking_payments/confirm_booking_payment.spec.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3 : implémenter le use case**

```ts
import logger from '@adonisjs/core/services/logger'

import BookingRepository from '#features/bookings/repositories/booking_repository'
import { isPaymentConsistent } from '#features/subscriptions/subscription_checkout'
import WaveSubscriptionService from '#services/wave_subscription_service'
import { DomainError } from '#utils/domain_error'

import type { BookingPaymentDto } from '../dto/booking_payment.dto.ts'
import BookingPaymentRepository from '../repositories/booking_payment_repository.ts'

/**
 * Constate l'issue du paiement Wave d'une réservation, sans attendre le
 * webhook.
 *
 * Appelé par l'app client à son retour au premier plan et par la page de
 * retour de Wave. La session est **relue chez Wave**, seule source qui fasse
 * foi : rien de ce que le client envoie n'est cru.
 *
 * `WaveSubscriptionService` sert ici malgré son nom : sa lecture de session
 * est générique et utilise la même clé `WAVE_API_KEY`.
 */
export class ConfirmBookingPaymentUseCase {
  constructor(
    private bookingRepo: Pick<BookingRepository, 'findById'> = new BookingRepository(),
    private paymentRepo: Pick<
      BookingPaymentRepository,
      'findPendingByBooking' | 'updateStatus'
    > = new BookingPaymentRepository(),
    private wave: Pick<WaveSubscriptionService, 'getCheckoutSession'> = new WaveSubscriptionService()
  ) {}

  async execute(bookingId: string, clientId: string): Promise<BookingPaymentDto> {
    const booking = await this.bookingRepo.findById(bookingId)
    // Même réponse pour une réservation inconnue et pour celle d'un autre.
    if (!booking || booking.client_id !== clientId) {
      throw new DomainError('booking_not_found', 'Réservation introuvable.', 404)
    }

    const payment = await this.executeForBooking(bookingId)
    if (!payment) throw new DomainError('payment_not_found', 'Paiement introuvable.', 404)
    return payment
  }

  /** Page de retour de Wave : pas de session, la réservation suffit. */
  async executeForBooking(bookingId: string): Promise<BookingPaymentDto | null> {
    const payment = await this.paymentRepo.findPendingByBooking(bookingId)
    if (!payment?.provider_checkout_id) return payment

    const session = await this.readSession(payment.provider_checkout_id)
    // Session inconnue de Wave : on ne clôt rien, une réponse erronée de Wave
    // ne doit pas effacer un paiement.
    if (!session) return payment

    const now = new Date()

    if (session.payment_status === 'succeeded') {
      if (
        !isPaymentConsistent(
          { _id: payment.transaction_reference, amount: payment.amount, currency: payment.currency },
          session
        )
      ) {
        logger.warn({ booking: bookingId, session: session.id }, 'Paiement Wave divergent')
        return (
          (await this.paymentRepo.updateStatus(payment.id, 'failed', {
            failure_reason: 'amount_mismatch',
          })) ?? payment
        )
      }

      return (
        (await this.paymentRepo.updateStatus(payment.id, 'success', {
          provider_transaction_id: session.transaction_id,
          paid_at: now,
        })) ?? payment
      )
    }

    if (session.checkout_status === 'expired' || session.payment_status === 'cancelled') {
      return (await this.paymentRepo.updateStatus(payment.id, 'expired', { expired_at: now })) ?? payment
    }

    // `open` / `processing` : le client n'a pas encore payé.
    return payment
  }

  private async readSession(checkoutId: string) {
    try {
      return await this.wave.getCheckoutSession(checkoutId)
    } catch (error) {
      logger.error({ err: error, checkoutId }, 'Lecture de la session Wave impossible')
      throw new DomainError(
        'payment_provider_unavailable',
        'Wave est momentanément injoignable. Réessayez dans un instant.',
        502
      )
    }
  }
}

export default ConfirmBookingPaymentUseCase
```

`isPaymentConsistent` compare `client_reference` à `_id` : on lui passe la `transaction_reference`, qui est l'identifiant du document de paiement et la `client_reference` envoyée à Wave. Vérifier que `BookingRepository.findById` existe et rend `client_id` (`grep -n "async findById" app/features/bookings/repositories/booking_repository.ts`).

Exporter dans `app/features/booking_payments/use_cases/index.ts` :

```ts
export { ConfirmBookingPaymentUseCase } from './confirm_booking_payment.use_case.ts'
```

- [ ] **Step 4 : vérifier**

Run: `cd api && node ace test unit --files=tests/unit/booking_payments/confirm_booking_payment.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5 : URLs de retour**

Dans `initialize_booking_payment.use_case.ts`, remplacer `successUrl` / `errorUrl` :

```ts
    // Page servie par l'API : les anciennes URL pointaient vers des routes
    // inexistantes, et le client tombait sur une 404 après avoir payé.
    const returnUrl = `${appUrl}/api/v1/payments/wave/bookings/${booking.id}/return`
```

```ts
      successUrl: `${returnUrl}?outcome=success`,
      errorUrl: `${returnUrl}?outcome=error`,
```

- [ ] **Step 6 : contrôleur**

`app/controllers/client/booking_payment_controller.ts` — ajouter l'import de `ConfirmBookingPaymentUseCase` depuis `../../features/booking_payments/use_cases/index.ts`, puis :

```ts
  async confirmWave(ctx: HttpContext) {
    const payment = await new ConfirmBookingPaymentUseCase().execute(
      ctx.params.id,
      ctx.authUser!.id
    )
    return ctx.response.ok({ data: payment })
  }

  /** Page affichée par Wave après le paiement, avant le retour dans l'app. */
  async waveReturn(ctx: HttpContext) {
    let status: string | null = null
    try {
      status = (await new ConfirmBookingPaymentUseCase().executeForBooking(ctx.params.booking_id))
        ?.status ?? null
    } catch {
      // Wave injoignable : la page reste utile, l'app confirmera au retour.
    }

    const message =
      status === 'success'
        ? 'Paiement reçu. Votre réservation est confirmée.'
        : ctx.request.input('outcome') === 'error'
          ? "Le paiement n'a pas abouti. Vous pouvez réessayer depuis l'application."
          : 'Paiement en cours de vérification.'

    return ctx.response
      .header('Content-Type', 'text/html; charset=utf-8')
      .send(
        `<!doctype html><html lang="fr"><head><meta charset="utf-8">` +
          `<meta name="viewport" content="width=device-width,initial-scale=1">` +
          `<title>RESI — Réservation</title></head>` +
          `<body style="font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1rem;text-align:center">` +
          `<h1 style="font-size:1.25rem">${message}</h1>` +
          `<p>Vous pouvez revenir dans l'application RESI.</p></body></html>`
      )
  }
```

Dans `waveWebhook`, remplacer `const rawBody = JSON.stringify(payload)` par :

```ts
    // Corps brut : la signature porte sur les octets reçus, qu'une
    // re-sérialisation ne reproduit pas.
    const rawBody = ctx.request.raw() ?? JSON.stringify(payload)
```

- [ ] **Step 7 : route de retour**

Dans `start/routes.ts`, sous `router.post('payments/wave/webhook', …)` :

```ts
    router
      .get('payments/wave/bookings/:booking_id/return', [
        ClientBookingPaymentController,
        'waveReturn',
      ])
      .as('booking_wave_return')
```

- [ ] **Step 8 : vérifier**

Run: `cd api && npm run typecheck && node ace test unit`
Expected: typecheck sans erreur, toute la suite unitaire PASS.

- [ ] **Step 9 : commit (sur demande, Tasks 3 à 5 ensemble)**

```bash
git add start/routes.ts app/controllers/client app/features/bookings/use_cases app/features/booking_payments tests/unit/bookings/public_availability.spec.ts tests/unit/booking_payments
git commit -m "feat(bookings): reservation client authentifiee, disponibilite publique et confirmation wave"
```

---

### Task 6 : historique client avec bien et état du paiement

**Files:**
- Modify: `api/app/features/bookings/dto/booking.dto.ts` (`payment_status?`)
- Create: `api/app/features/bookings/client_booking_view.ts`
- Modify: `api/app/features/bookings/use_cases/list_my_bookings.use_case.ts`
- Modify: `api/app/models/booking_payment.ts` (si `findByClient` manque)
- Test: `api/tests/unit/bookings/client_booking_view.spec.ts`

**Interfaces:**
- Produces: `GET /client/bookings` → chaque élément porte `property?: BookingPropertySummary` et `payment_status?: BookingPaymentStatus | null` ; `export function attachClientView(bookings, properties: Map<string, {id,title,address:{city},media:{images?}}>, payments: Array<{booking_id,status,created_at}>): BookingDto[]`.

- [ ] **Step 1 : écrire le test qui échoue**

```ts
import { test } from '@japa/runner'

import { attachClientView } from '#features/bookings/client_booking_view'

const booking = { id: 'b1', property_id: 'p1' } as never

test.group('attachClientView', () => {
  test('joint le résumé du bien et le dernier état de paiement', ({ assert }) => {
    const [view] = attachClientView(
      [booking],
      new Map([['p1', { id: 'p1', title: 'Villa Cocody', address: { city: 'Abidjan' }, media: { images: ['a.jpg'] } }]]),
      [
        { booking_id: 'b1', status: 'expired', created_at: new Date('2026-10-01') },
        { booking_id: 'b1', status: 'success', created_at: new Date('2026-10-02') },
      ]
    )

    assert.deepEqual(view.property, { id: 'p1', title: 'Villa Cocody', city: 'Abidjan', image: 'a.jpg' })
    assert.equal(view.payment_status, 'success')
  })

  test('sans paiement ni bien : champs nuls, réservation conservée', ({ assert }) => {
    const [view] = attachClientView([booking], new Map(), [])
    assert.isUndefined(view.property)
    assert.isNull(view.payment_status)
  })
})
```

- [ ] **Step 2 : vérifier l'échec**

Run: `cd api && node ace test unit --files=tests/unit/bookings/client_booking_view.spec.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3 : implémenter**

`booking.dto.ts`, dans `BookingDto`, après `property?` :

```ts
  /**
   * Dernier état du paiement en ligne, joint à la liste du client seulement :
   * l'historique doit distinguer une réservation payée d'une réservation en
   * attente. `null` si aucun paiement n'a été lancé.
   */
  payment_status?: BookingPaymentStatus | null
```

(importer `BookingPaymentStatus` en type depuis `#features/booking_payments/dto/booking_payment.dto`).

`client_booking_view.ts` :

```ts
import type { BookingPaymentStatus } from '#features/booking_payments/dto/booking_payment.dto'

import type { BookingDto } from './dto/booking.dto.ts'

interface PropertyLike {
  id: string
  title: string
  address: { city: string }
  media: { images?: string[] }
}

interface PaymentLike {
  booking_id: string
  status: BookingPaymentStatus
  created_at: Date
}

/**
 * Habille la liste du client : résumé du bien et dernier état de paiement.
 *
 * Fonction pure, séparée du use case : les lectures se font en lot à côté, et
 * l'assemblage se teste sans Firestore.
 */
export function attachClientView(
  bookings: readonly BookingDto[],
  properties: Map<string, PropertyLike>,
  payments: readonly PaymentLike[]
): BookingDto[] {
  const latest = new Map<string, PaymentLike>()
  for (const payment of payments) {
    const current = latest.get(payment.booking_id)
    if (!current || payment.created_at > current.created_at) latest.set(payment.booking_id, payment)
  }

  return bookings.map((booking) => {
    const property = properties.get(booking.property_id)
    return {
      ...booking,
      ...(property
        ? {
            property: {
              id: property.id,
              title: property.title,
              city: property.address.city,
              image: property.media.images?.[0] ?? null,
            },
          }
        : {}),
      payment_status: latest.get(booking.id)?.status ?? null,
    }
  })
}
```

Dans `app/models/booking_payment.ts`, la requête par client existe (`payments().where('client_id', '==', clientId)`, ~l. 117) : lire son nom exact et s'en servir. Si elle n'est pas exposée en méthode, ajouter :

```ts
  /** Paiements d'un client, pour habiller son historique de réservations. */
  async findByClient(clientId: string): Promise<BookingPaymentRecord[]> {
    const snapshot = await payments().where('client_id', '==', clientId).get()
    return toDocs<BookingPaymentDocument>(snapshot.docs)
  },
```

`list_my_bookings.use_case.ts` :

```ts
import BookingPayment from '#models/booking_payment'
import PropertyRepository from '#features/properties/repositories/property_repository'

import { attachClientView } from '../client_booking_view.ts'

    const { data, total, page, perPage } = await this.repo.paginate({ ...input, client_id })
    // Deux lectures groupées, quel que soit le nombre de lignes.
    const [properties, payments] = await Promise.all([
      new PropertyRepository().findManyByIds(data.map((b) => b.property_id)),
      BookingPayment.findByClient(client_id),
    ])
    return {
      data: attachClientView(data, properties, payments),
      meta: {
        total,
        perPage,
        currentPage: page,
        lastPage: Math.max(1, Math.ceil(total / perPage)),
      },
    }
```

- [ ] **Step 4 : vérifier**

Run: `cd api && node ace test unit --files=tests/unit/bookings/client_booking_view.spec.ts && npm run typecheck`
Expected: PASS (2 tests), typecheck sans erreur.

- [ ] **Step 5 : commit (sur demande)**

```bash
git add app/features/bookings app/models/booking_payment.ts tests/unit/bookings/client_booking_view.spec.ts
git commit -m "feat(bookings): joindre le bien et l'etat du paiement a l'historique client"
```

---

### Task 7 : vérification d'ensemble et vérification manuelle des routes

**Files:** aucun.

- [ ] **Step 1 : suite complète et qualité**

Run: `cd api && node ace test unit && npm run typecheck && npm run lint`
Expected: tout PASS, aucune erreur de type ni de lint.

- [ ] **Step 2 : routes, serveur local lancé (`npm run dev`)**

```bash
# Public
curl -s localhost:3333/api/v1/client/properties | head -c 200          # 200, { data, meta }
curl -s localhost:3333/api/v1/client/properties/<id>/availability      # 200, { data: [{start,end}] }
# Authentifié
curl -s -o /dev/null -w "%{http_code}\n" localhost:3333/api/v1/client/bookings          # 401
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer <jeton proprio>" \
  localhost:3333/api/v1/client/bookings                                                 # 403
curl -s -H "Authorization: Bearer <jeton client>" localhost:3333/api/v1/client/bookings # 200
# Inscription admin refusée
curl -s -X POST localhost:3333/api/v1/auth/register/init -H 'Content-Type: application/json' \
  -d '{"full_name":"X Y","auth_channel":"email","email":"x@y.ci","password":"motdepasse1","password_confirmation":"motdepasse1","role_name":"admin"}'  # 422
# Page de retour
curl -s "localhost:3333/api/v1/payments/wave/bookings/<id>/return?outcome=error"         # HTML
```

Expected : les codes indiqués en commentaire. Reporter tout écart avant de passer au plan client.
