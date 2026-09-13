# Réservations comptoir — API (plan d'implémentation)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre au propriétaire d'enregistrer une réservation comptoir avec un carnet de clients, en corrigeant la répartition du revenu et le calcul de disponibilité.

**Architecture:** Trois fonctions pures testables isolément (`revenue_split`, `availability`, extension de `stay_pricing`) portent les règles de calcul. Une collection Firestore `clients` scoppée par `owner_id` porte le carnet. Un `CreateOwnerBookingUseCase` distinct du flux client gère l'idempotence et les montants négociés. Les contrôleurs et validateurs suivent l'existant à l'identique.

**Tech Stack:** AdonisJS 6 (ESM, `#imports`), Firestore (firebase-admin), Vine (validation), Japa (tests), Cloudinary (pièces privées).

**Spec:** `docs/superpowers/specs/2026-08-21-reservations-offline-design.md`

## Global Constraints

- **Langue :** commentaires et messages d'erreur en français, comme tout le code existant. Les commentaires expliquent *pourquoi*, jamais *quoi*.
- **Imports :** sous-chemins `#models/*`, `#utils/*`, `#firebase/*`. Les imports relatifs entre fichiers d'une même feature portent l'extension `.ts` (voir `create_booking.use_case.ts`).
- **Montants :** FCFA, entiers. Tout calcul se termine par `Math.round` — le franc n'a pas de subdivision.
- **Dates :** `Date` JavaScript. Firestore convertit via `toPayload` / `toDoc`.
- **Erreurs métier :** `DomainError(code, message, status)` depuis `#utils/domain_error`.
- **Champs additifs uniquement :** aucun document Firestore existant ne doit devenir illisible. Tout nouveau champ est optionnel en lecture, avec un repli explicite.
- **Tests :** `node ace test unit`. Fichiers en `tests/unit/**/*.spec.ts`, groupés par `test.group`.
- **Commits :** un par tâche, en français, préfixe `feat:` / `fix:` / `test:` / `chore:`.

---

### Task 0: Réparer le harnais de test

`.env.test` ne contient qu'une ligne (`SESSION_DRIVER=memory`) que le schéma refuse — le runner ne démarre pas. Aucune tâche TDD n'est possible avant.

**Files:**
- Modify: `.env.test`

**Interfaces:**
- Consumes: rien
- Produces: `node ace test unit` démarre et exécute les tests

- [ ] **Step 1: Remplacer le contenu de `.env.test`**

```bash
cat > .env.test <<'EOF'
# Node
TZ=UTC
PORT=3334
HOST=localhost
NODE_ENV=test

# App
LOG_LEVEL=silent
APP_KEY=Xk3mP9qR7tW2vY5zB8dF1gH4jL6nQ0sU
APP_URL=http://localhost:3334

# Session
SESSION_DRIVER=cookie

# Firebase — non contacté par les tests unitaires (fonctions pures).
FIREBASE_DATABASE_URL=https://resi-test.firebaseio.com

# JWT
JWT_ACCESS_SECRET=test-access-secret-not-used-in-production
JWT_REFRESH_SECRET=test-refresh-secret-not-used-in-production
EOF
```

- [ ] **Step 2: Vérifier que le runner démarre**

Run: `node ace test unit`
Expected: `NO TESTS EXECUTED` (aucun test n'existe encore), sans erreur de validation d'environnement.

- [ ] **Step 3: Commit**

```bash
git add .env.test
git commit -m "chore: reparer la configuration d'environnement des tests"
```

---

### Task 1: Types de séjour et tarifs dérivés

**Files:**
- Create: `app/features/bookings/stay_type.ts`
- Test: `tests/unit/bookings/stay_type.spec.ts`

**Interfaces:**
- Consumes: `PropertyPricing` depuis `#models/property`
- Produces:
  - `STAY_TYPES: readonly ['passage', 'half_day', 'full_day']`
  - `type StayType = 'passage' | 'half_day' | 'full_day'`
  - `resolveStayTypePrice(pricing: PropertyPricing, stayType: StayType): number`
  - `stayTypeOccupancyDays(stayType: StayType, days: number): number`
  - `defaultCheckOutFor(stayType: StayType, checkIn: Date): Date`
  - `HALF_DAY_RATIO = 0.5`, `PASSAGE_RATIO = 0.3`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/bookings/stay_type.spec.ts
import { test } from '@japa/runner'
import {
  defaultCheckOutFor,
  resolveStayTypePrice,
  stayTypeOccupancyDays,
} from '#features/bookings/stay_type'

import type { PropertyPricing } from '#models/property'

const pricing: PropertyPricing = {
  daily_price: 20000,
  price_tiers: [],
  minimum_stay_days: 1,
  maximum_stay_days: null,
}

test.group('resolveStayTypePrice', () => {
  test('le séjour complet vaut le tarif journalier', ({ assert }) => {
    assert.equal(resolveStayTypePrice(pricing, 'full_day'), 20000)
  })

  test('la demi-journée vaut la moitié du tarif journalier', ({ assert }) => {
    assert.equal(resolveStayTypePrice(pricing, 'half_day'), 10000)
  })

  test('le passage vaut 30 % du tarif journalier', ({ assert }) => {
    assert.equal(resolveStayTypePrice(pricing, 'passage'), 6000)
  })

  test('le tarif dérivé est arrondi au franc', ({ assert }) => {
    // 15 001 × 0,3 = 4500,3 : un montant à virgule se propagerait
    // jusqu'au montant encaissé.
    const odd: PropertyPricing = { ...pricing, daily_price: 15001 }
    assert.equal(resolveStayTypePrice(odd, 'passage'), 4500)
  })
})

test.group('stayTypeOccupancyDays', () => {
  test('un séjour complet occupe le bien un jour par jour facturé', ({ assert }) => {
    assert.equal(stayTypeOccupancyDays('full_day', 3), 3)
  })

  test('une demi-journée occupe une demi-journée', ({ assert }) => {
    assert.equal(stayTypeOccupancyDays('half_day', 1), 0.5)
  })

  test('un passage occupe un quart de journée', ({ assert }) => {
    assert.equal(stayTypeOccupancyDays('passage', 1), 0.25)
  })
})

test.group('defaultCheckOutFor', () => {
  test('un séjour complet court 24 h', ({ assert }) => {
    const checkIn = new Date('2026-10-28T12:00:00.000Z')
    assert.equal(
      defaultCheckOutFor('full_day', checkIn).toISOString(),
      '2026-10-29T12:00:00.000Z'
    )
  })

  test('une demi-journée court 12 h', ({ assert }) => {
    const checkIn = new Date('2026-10-28T12:00:00.000Z')
    assert.equal(
      defaultCheckOutFor('half_day', checkIn).toISOString(),
      '2026-10-29T00:00:00.000Z'
    )
  })

  test('un passage court 4 h par défaut', ({ assert }) => {
    const checkIn = new Date('2026-10-28T14:00:00.000Z')
    assert.equal(
      defaultCheckOutFor('passage', checkIn).toISOString(),
      '2026-10-28T18:00:00.000Z'
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test unit --files=stay_type`
Expected: FAIL — le module `#features/bookings/stay_type` n'existe pas.

- [ ] **Step 3: Write the implementation**

```typescript
// app/features/bookings/stay_type.ts
import type { PropertyPricing } from '#models/property'

/**
 * Types de séjour d'une réservation comptoir.
 *
 * Le séjour complet correspond au flux en ligne existant, facturé en jours
 * d'occupation. La demi-journée et le passage sont infra-journaliers : ils
 * n'existaient pas avant la réservation comptoir, où un client peut occuper
 * un bien quelques heures.
 */
export const STAY_TYPES = ['passage', 'half_day', 'full_day'] as const
export type StayType = (typeof STAY_TYPES)[number]

const MILLISECONDS_PER_HOUR = 1000 * 60 * 60

/**
 * Tarifs dérivés du tarif journalier.
 *
 * La grille du bien ne porte qu'un `daily_price` : dériver évite une migration
 * et rend les trois types de séjour disponibles sur tous les biens existants.
 * Ces ratios pourront devenir des champs surchargeables sans rien casser — le
 * calcul retomberait ici en leur absence.
 */
export const HALF_DAY_RATIO = 0.5
export const PASSAGE_RATIO = 0.3

/** Durée par défaut d'un séjour, en heures. */
const STAY_DURATION_HOURS: Record<StayType, number> = {
  full_day: 24,
  half_day: 12,
  // Un passage n'a pas de durée canonique ; 4 h sert de proposition à
  // l'ouverture du formulaire, le propriétaire saisissant l'heure réelle.
  passage: 4,
}

/**
 * Part de journée qu'un séjour immobilise, pour le taux d'occupation.
 *
 * Ne sert jamais à la facturation : compter une demi-journée pour un jour
 * entier gonflerait le taux d'occupation, mais son montant reste indivisible.
 */
const OCCUPANCY_WEIGHT: Record<StayType, number> = {
  full_day: 1,
  half_day: 0.5,
  passage: 0.25,
}

/** Tarif plein d'une unité de ce type de séjour, arrondi au franc. */
export function resolveStayTypePrice(pricing: PropertyPricing, stayType: StayType): number {
  const daily = pricing.daily_price

  switch (stayType) {
    case 'full_day':
      return Math.round(daily)
    case 'half_day':
      return Math.round(daily * HALF_DAY_RATIO)
    case 'passage':
      return Math.round(daily * PASSAGE_RATIO)
  }
}

/** Jours d'occupation immobilisés, pondérés par le type de séjour. */
export function stayTypeOccupancyDays(stayType: StayType, days: number): number {
  return OCCUPANCY_WEIGHT[stayType] * days
}

/** Heure de sortie proposée à l'ouverture du formulaire. */
export function defaultCheckOutFor(stayType: StayType, checkIn: Date): Date {
  return new Date(checkIn.getTime() + STAY_DURATION_HOURS[stayType] * MILLISECONDS_PER_HOUR)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test unit --files=stay_type`
Expected: PASS — 10 tests.

- [ ] **Step 5: Commit**

```bash
git add app/features/bookings/stay_type.ts tests/unit/bookings/stay_type.spec.ts
git commit -m "feat: types de sejour et tarifs derives (passage, demi-journee)"
```

---

### Task 2: Répartition du revenu au prorata

C'est la correction que tu as demandée : un séjour du 28 octobre au 3 novembre doit imputer 4 jours à octobre et 2 à novembre, pas 6 à octobre.

**Files:**
- Create: `app/features/finance/revenue_split.ts`
- Test: `tests/unit/finance/revenue_split.spec.ts`

**Interfaces:**
- Consumes: rien (fonction pure)
- Produces:
  - `interface RevenueSlice { year: number; month: number; days: number; amount: number }`
  - `splitRevenueByMonth(start: Date, end: Date, amount: number): RevenueSlice[]`
  - `daysWithinWindow(start: Date, end: Date, from?: Date, to?: Date): number`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/finance/revenue_split.spec.ts
import { test } from '@japa/runner'
import { daysWithinWindow, splitRevenueByMonth } from '#features/finance/revenue_split'

test.group('splitRevenueByMonth', () => {
  test('un séjour tenant dans un seul mois produit une seule tranche', ({ assert }) => {
    const slices = splitRevenueByMonth(
      new Date('2026-10-10T12:00:00.000Z'),
      new Date('2026-10-13T12:00:00.000Z'),
      30000
    )

    assert.lengthOf(slices, 1)
    assert.deepEqual(slices[0], { year: 2026, month: 9, days: 3, amount: 30000 })
  })

  test('un séjour à cheval répartit au prorata des jours de chaque mois', ({ assert }) => {
    // Le cas de référence : 28 oct → 3 nov, 6 jours, 60 000 F.
    // Octobre en porte 4 (28, 29, 30, 31), novembre 2.
    const slices = splitRevenueByMonth(
      new Date('2026-10-28T12:00:00.000Z'),
      new Date('2026-11-03T12:00:00.000Z'),
      60000
    )

    assert.lengthOf(slices, 2)
    assert.deepEqual(slices[0], { year: 2026, month: 9, days: 4, amount: 40000 })
    assert.deepEqual(slices[1], { year: 2026, month: 10, days: 2, amount: 20000 })
  })

  test('la somme des tranches égale toujours le montant total', ({ assert }) => {
    // 100 000 / 3 jours ne tombe pas juste : le reste va sur la dernière
    // tranche, sinon des francs disparaissent du chiffre d'affaires.
    const slices = splitRevenueByMonth(
      new Date('2026-10-30T12:00:00.000Z'),
      new Date('2026-11-02T12:00:00.000Z'),
      100000
    )

    const total = slices.reduce((sum, slice) => sum + slice.amount, 0)
    assert.equal(total, 100000)
  })

  test('un séjour couvrant trois mois produit trois tranches', ({ assert }) => {
    const slices = splitRevenueByMonth(
      new Date('2026-10-30T12:00:00.000Z'),
      new Date('2026-12-02T12:00:00.000Z'),
      330000
    )

    assert.lengthOf(slices, 3)
    assert.deepEqual(
      slices.map((s) => s.month),
      [9, 10, 11]
    )
    assert.equal(
      slices.reduce((sum, s) => sum + s.amount, 0),
      330000
    )
  })

  test('un séjour à cheval sur deux années sépare les tranches', ({ assert }) => {
    const slices = splitRevenueByMonth(
      new Date('2026-12-30T12:00:00.000Z'),
      new Date('2027-01-02T12:00:00.000Z'),
      30000
    )

    assert.lengthOf(slices, 2)
    assert.deepEqual(slices[0], { year: 2026, month: 11, days: 2, amount: 20000 })
    assert.deepEqual(slices[1], { year: 2027, month: 0, days: 1, amount: 10000 })
  })

  test('un séjour de moins d’une journée compte pour un jour entier', ({ assert }) => {
    // Un passage de 4 h ne doit pas produire une tranche à zéro jour, qui
    // ferait disparaître son montant du chiffre d'affaires.
    const slices = splitRevenueByMonth(
      new Date('2026-10-28T14:00:00.000Z'),
      new Date('2026-10-28T18:00:00.000Z'),
      6000
    )

    assert.lengthOf(slices, 1)
    assert.deepEqual(slices[0], { year: 2026, month: 9, days: 1, amount: 6000 })
  })
})

test.group('daysWithinWindow', () => {
  test('sans fenêtre, tous les jours du séjour comptent', ({ assert }) => {
    const days = daysWithinWindow(
      new Date('2026-10-28T12:00:00.000Z'),
      new Date('2026-11-03T12:00:00.000Z')
    )
    assert.equal(days, 6)
  })

  test('seuls les jours tombant dans la fenêtre comptent', ({ assert }) => {
    // Le défaut corrigé : octobre se voyait attribuer les 6 jours du séjour,
    // d'où un taux d'occupation dépassant 100 %.
    const days = daysWithinWindow(
      new Date('2026-10-28T12:00:00.000Z'),
      new Date('2026-11-03T12:00:00.000Z'),
      new Date('2026-10-01T00:00:00.000Z'),
      new Date('2026-11-01T00:00:00.000Z')
    )
    assert.equal(days, 4)
  })

  test('un séjour hors fenêtre ne compte aucun jour', ({ assert }) => {
    const days = daysWithinWindow(
      new Date('2026-09-01T12:00:00.000Z'),
      new Date('2026-09-05T12:00:00.000Z'),
      new Date('2026-10-01T00:00:00.000Z'),
      new Date('2026-11-01T00:00:00.000Z')
    )
    assert.equal(days, 0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test unit --files=revenue_split`
Expected: FAIL — le module `#features/finance/revenue_split` n'existe pas.

- [ ] **Step 3: Write the implementation**

```typescript
// app/features/finance/revenue_split.ts

/**
 * Répartition du revenu d'un séjour entre les mois qu'il traverse.
 *
 * Un séjour du 28 octobre au 3 novembre imputait auparavant la totalité de son
 * montant à octobre — son mois de début. Le chiffre d'affaires d'octobre
 * incluait donc des jours de novembre, et le taux d'occupation comptait les
 * jours entiers du séjour dans chaque fenêtre, d'où des taux dépassant 100 %
 * que le calcul plafonnait artificiellement.
 *
 * Le revenu réparti ici est le **revenu constaté** : il répond à « ce bien
 * a-t-il été rentable en octobre ». Il ne se confond pas avec l'encaissement
 * (acompte, montant reçu), qui relève de la trésorerie.
 */

const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24

export interface RevenueSlice {
  year: number
  /** Indexé comme `Date.getMonth()` : 0 pour janvier. */
  month: number
  days: number
  amount: number
}

/** Minuit au premier jour du mois suivant. */
function startOfNextMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
}

/**
 * Jours entamés entre deux instants, au minimum 1.
 *
 * `Math.ceil` : une sortie à 14h le lendemain d'une entrée à 12h dépasse la
 * journée due et en entame une seconde — même règle que `countStayDays`. Le
 * minimum de 1 couvre les séjours infra-journaliers (passage, demi-journée),
 * dont le montant ne doit pas disparaître dans une tranche à zéro jour.
 */
function countDays(start: Date, end: Date): number {
  const raw = Math.ceil((end.getTime() - start.getTime()) / MILLISECONDS_PER_DAY)
  return Math.max(1, raw)
}

/**
 * Découpe un séjour en tranches mensuelles, montant réparti au prorata.
 *
 * Le reste d'arrondi est imputé à la dernière tranche : le FCFA n'a pas de
 * subdivision, et une division inexacte ferait disparaître des francs du
 * chiffre d'affaires. La somme des tranches égale donc toujours le montant.
 */
export function splitRevenueByMonth(start: Date, end: Date, amount: number): RevenueSlice[] {
  const totalDays = countDays(start, end)

  const slices: Array<Omit<RevenueSlice, 'amount'>> = []
  let cursor = start

  while (cursor < end) {
    const boundary = startOfNextMonth(cursor)
    const sliceEnd = boundary < end ? boundary : end

    slices.push({
      year: cursor.getUTCFullYear(),
      month: cursor.getUTCMonth(),
      days: countDays(cursor, sliceEnd),
    })

    cursor = sliceEnd
  }

  // Un séjour infra-journalier (sortie le jour même) ne franchit aucune borne
  // et sortirait de la boucle sans tranche.
  if (slices.length === 0) {
    slices.push({
      year: start.getUTCFullYear(),
      month: start.getUTCMonth(),
      days: 1,
    })
  }

  // Les jours des tranches peuvent excéder le total quand chaque bord est
  // arrondi au jour entamé ; on répartit sur leur propre somme pour que les
  // parts restent cohérentes entre elles.
  const slicedDays = slices.reduce((sum, slice) => sum + slice.days, 0) || totalDays

  let distributed = 0
  return slices.map((slice, index) => {
    const isLast = index === slices.length - 1
    const sliceAmount = isLast
      ? amount - distributed
      : Math.round((amount * slice.days) / slicedDays)

    distributed += sliceAmount
    return { ...slice, amount: sliceAmount }
  })
}

/**
 * Jours du séjour tombant à l'intérieur d'une fenêtre.
 *
 * Sert au taux d'occupation : un séjour à cheval sur la borne ne doit imputer
 * à la fenêtre que les jours qui lui reviennent.
 */
export function daysWithinWindow(start: Date, end: Date, from?: Date, to?: Date): number {
  const effectiveStart = from && from > start ? from : start
  const effectiveEnd = to && to < end ? to : end

  if (effectiveEnd <= effectiveStart) return 0

  return countDays(effectiveStart, effectiveEnd)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test unit --files=revenue_split`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add app/features/finance/revenue_split.ts tests/unit/finance/revenue_split.spec.ts
git commit -m "feat: repartition du revenu au prorata des mois traverses"
```

---

### Task 3: Disponibilité par chevauchement de dates

**Files:**
- Create: `app/features/bookings/availability.ts`
- Test: `tests/unit/bookings/availability.spec.ts`

**Interfaces:**
- Consumes: rien (fonction pure)
- Produces:
  - `interface BookedPeriod { check_in_at: Date; check_out_at: Date; status: string }`
  - `periodsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean`
  - `findOverlappingPeriod<T extends BookedPeriod>(candidate: {check_in_at, check_out_at}, existing: T[]): T | null`
  - `ACTIVE_BOOKING_STATUSES: readonly ['confirmed', 'in_progress']`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/bookings/availability.spec.ts
import { test } from '@japa/runner'
import { findOverlappingPeriod, periodsOverlap } from '#features/bookings/availability'

const d = (iso: string) => new Date(iso)

test.group('periodsOverlap', () => {
  test('deux périodes disjointes ne se chevauchent pas', ({ assert }) => {
    assert.isFalse(
      periodsOverlap(
        d('2026-10-01T12:00:00Z'),
        d('2026-10-05T12:00:00Z'),
        d('2026-10-10T12:00:00Z'),
        d('2026-10-15T12:00:00Z')
      )
    )
  })

  test('une sortie à 12h et une entrée à 12h le même jour ne se chevauchent pas', ({
    assert,
  }) => {
    // Bornes strictes : c'est ce qui permet d'enchaîner deux séjours dans la
    // même journée, conformément à la règle 12h → 12h.
    assert.isFalse(
      periodsOverlap(
        d('2026-10-01T12:00:00Z'),
        d('2026-10-05T12:00:00Z'),
        d('2026-10-05T12:00:00Z'),
        d('2026-10-08T12:00:00Z')
      )
    )
  })

  test('un chevauchement partiel est détecté', ({ assert }) => {
    assert.isTrue(
      periodsOverlap(
        d('2026-10-01T12:00:00Z'),
        d('2026-10-06T12:00:00Z'),
        d('2026-10-05T12:00:00Z'),
        d('2026-10-08T12:00:00Z')
      )
    )
  })

  test('une période englobant l’autre est un chevauchement', ({ assert }) => {
    assert.isTrue(
      periodsOverlap(
        d('2026-10-01T12:00:00Z'),
        d('2026-10-20T12:00:00Z'),
        d('2026-10-05T12:00:00Z'),
        d('2026-10-08T12:00:00Z')
      )
    )
  })

  test('une période incluse dans l’autre est un chevauchement', ({ assert }) => {
    assert.isTrue(
      periodsOverlap(
        d('2026-10-05T12:00:00Z'),
        d('2026-10-08T12:00:00Z'),
        d('2026-10-01T12:00:00Z'),
        d('2026-10-20T12:00:00Z')
      )
    )
  })
})

test.group('findOverlappingPeriod', () => {
  const candidate = {
    check_in_at: d('2026-10-05T12:00:00Z'),
    check_out_at: d('2026-10-08T12:00:00Z'),
  }

  test('retourne null quand aucune réservation ne chevauche', ({ assert }) => {
    const existing = [
      {
        check_in_at: d('2026-10-01T12:00:00Z'),
        check_out_at: d('2026-10-05T12:00:00Z'),
        status: 'confirmed',
      },
    ]
    assert.isNull(findOverlappingPeriod(candidate, existing))
  })

  test('retourne la réservation qui chevauche', ({ assert }) => {
    const existing = [
      {
        check_in_at: d('2026-10-06T12:00:00Z'),
        check_out_at: d('2026-10-10T12:00:00Z'),
        status: 'confirmed',
      },
    ]
    assert.isNotNull(findOverlappingPeriod(candidate, existing))
  })

  test('une réservation annulée n’empêche pas de réserver', ({ assert }) => {
    const existing = [
      {
        check_in_at: d('2026-10-06T12:00:00Z'),
        check_out_at: d('2026-10-10T12:00:00Z'),
        status: 'cancelled',
      },
    ]
    assert.isNull(findOverlappingPeriod(candidate, existing))
  })

  test('une réservation terminée n’empêche pas de réserver', ({ assert }) => {
    const existing = [
      {
        check_in_at: d('2026-10-06T12:00:00Z'),
        check_out_at: d('2026-10-10T12:00:00Z'),
        status: 'completed',
      },
    ]
    assert.isNull(findOverlappingPeriod(candidate, existing))
  })

  test('un séjour en cours empêche de réserver', ({ assert }) => {
    const existing = [
      {
        check_in_at: d('2026-10-06T12:00:00Z'),
        check_out_at: d('2026-10-10T12:00:00Z'),
        status: 'in_progress',
      },
    ]
    assert.isNotNull(findOverlappingPeriod(candidate, existing))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test unit --files=availability`
Expected: FAIL — le module `#features/bookings/availability` n'existe pas.

- [ ] **Step 3: Write the implementation**

```typescript
// app/features/bookings/availability.ts

/**
 * Disponibilité d'un bien, déduite des dates plutôt que d'un statut.
 *
 * Le bien portait auparavant `status: 'reserved'` dès la première réservation.
 * Trois défauts : une réservation pour dans trois mois rendait le bien
 * invendable immédiatement ; aucun flux ne le remettait en `published`, ni
 * l'annulation ni la fin du séjour, si bien qu'il restait bloqué
 * indéfiniment ; et deux séjours disjoints s'excluaient mutuellement.
 *
 * Déduire la disponibilité des dates supprime les trois : le bien se libère de
 * lui-même, sans état à remettre à zéro ni tâche planifiée.
 */

/** Statuts qui immobilisent le bien. Les autres laissent la période libre. */
export const ACTIVE_BOOKING_STATUSES = ['confirmed', 'in_progress'] as const

export interface BookedPeriod {
  check_in_at: Date
  check_out_at: Date
  status: string
}

/**
 * Deux périodes se chevauchent-elles ?
 *
 * Bornes strictes : une sortie à 12h et une entrée à 12h le même jour ne se
 * chevauchent pas. C'est ce qui rend possible l'enchaînement de deux séjours
 * dans la même journée, la règle du bien étant 12h → 12h.
 */
export function periodsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime()
}

/**
 * Première réservation active chevauchant la période demandée, s'il y en a une.
 *
 * Retourne la réservation plutôt qu'un booléen : l'appelant doit pouvoir dire
 * au propriétaire *quelle* réservation bloque, un simple refus étant
 * inexploitable pour résoudre un conflit de synchronisation.
 */
export function findOverlappingPeriod<T extends BookedPeriod>(
  candidate: { check_in_at: Date; check_out_at: Date },
  existing: T[]
): T | null {
  const blocking = ACTIVE_BOOKING_STATUSES as readonly string[]

  for (const period of existing) {
    if (!blocking.includes(period.status)) continue

    if (
      periodsOverlap(
        candidate.check_in_at,
        candidate.check_out_at,
        period.check_in_at,
        period.check_out_at
      )
    ) {
      return period
    }
  }

  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test unit --files=availability`
Expected: PASS — 10 tests.

- [ ] **Step 5: Commit**

```bash
git add app/features/bookings/availability.ts tests/unit/bookings/availability.spec.ts
git commit -m "feat: disponibilite d'un bien par chevauchement de dates"
```

---

### Task 4: Modèle Firestore `clients`

**Files:**
- Create: `app/models/client.ts`
- Modify: `app/firebase/firestore.ts` (ajouter `clients: 'clients'` à `COLLECTIONS`, ligne ~40)
- Test: `tests/unit/models/client_normalization.spec.ts`

**Interfaces:**
- Consumes: `COLLECTIONS`, `collection`, `toDoc`, `toDocs`, `toPayload`, `WithId`, `countQuery` depuis `#firebase/firestore`
- Produces:
  - `ClientDocument`, `ClientRecord`, `ClientStats`
  - `ID_DOCUMENT_TYPES`, `CLIENT_STATUSES`
  - `normalizePhone(phone: string): string`
  - `Client.findById`, `Client.findByPhone`, `Client.create`, `Client.update`, `Client.paginate`, `Client.touchStats`

- [ ] **Step 1: Write the failing test**

Seule la normalisation du téléphone est testable sans Firestore ; c'est aussi la règle qui porte le dédoublonnage.

```typescript
// tests/unit/models/client_normalization.spec.ts
import { test } from '@japa/runner'
import { normalizePhone } from '#models/client'

test.group('normalizePhone', () => {
  test('supprime les espaces et séparateurs', ({ assert }) => {
    assert.equal(normalizePhone('07 12 34 56 78'), '0712345678')
    assert.equal(normalizePhone('07-12-34-56-78'), '0712345678')
    assert.equal(normalizePhone('07.12.34.56.78'), '0712345678')
  })

  test('conserve l’indicatif international', ({ assert }) => {
    assert.equal(normalizePhone('+225 07 12 34 56 78'), '+2250712345678')
  })

  test('un numéro déjà normalisé est inchangé', ({ assert }) => {
    assert.equal(normalizePhone('0712345678'), '0712345678')
  })

  test('les parenthèses sont retirées', ({ assert }) => {
    assert.equal(normalizePhone('(225) 0712345678'), '2250712345678')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test unit --files=client_normalization`
Expected: FAIL — le module `#models/client` n'existe pas.

- [ ] **Step 3: Ajouter la collection au registre**

Dans `app/firebase/firestore.ts`, à l'intérieur de `COLLECTIONS` (après `typeOfPieces`) :

```typescript
  typeOfPieces: 'type_of_pieces',
  clients: 'clients',
} as const
```

- [ ] **Step 4: Write the implementation**

```typescript
// app/models/client.ts
import {
  COLLECTIONS,
  collection,
  countQuery,
  toDoc,
  toDocs,
  toPayload,
  type WithId,
} from '#firebase/firestore'

/**
 * Carnet de clients d'un propriétaire.
 *
 * Distinct de `users` : ces clients se présentent au comptoir et n'ont pas de
 * compte sur la plateforme. Les mêler aux utilisateurs mêlerait des fiches qui
 * ne se connecteront jamais aux contraintes de l'authentification (unicité
 * globale de l'e-mail, statut de validation, sessions).
 *
 * Le carnet est scoppé par `owner_id` : deux propriétaires peuvent avoir le
 * même client, chacun avec sa fiche et ses pièces. Aucun propriétaire ne doit
 * pouvoir constater l'existence des clients d'un autre.
 */

export const ID_DOCUMENT_TYPES = ['cni', 'passeport', 'permis'] as const
export type ClientIdDocumentType = (typeof ID_DOCUMENT_TYPES)[number]

export const CLIENT_STATUSES = ['active', 'archived'] as const
export type ClientStatus = (typeof CLIENT_STATUSES)[number]

export interface ClientStats {
  total_stays: number
  total_paid: number
  last_stay_at: Date | null
}

export interface ClientDocument {
  owner_id: string

  full_name: string
  /** Normalisé via `normalizePhone` : c'est la clé de dédoublonnage. */
  phone: string
  whatsapp: string | null

  id_document_type: ClientIdDocumentType | null
  id_document_number: string | null
  /**
   * Références Cloudinary privées, jamais des URLs : une URL signée expire, et
   * la persister produirait des liens morts. L'URL est régénérée à la lecture.
   */
  id_document_front_public_id: string | null
  id_document_back_public_id: string | null
  /** `complete` dès que les deux faces sont déposées. */
  documents_status: 'complete' | 'pending'

  stats: ClientStats
  status: ClientStatus

  created_at: Date
  updated_at: Date
}

export type ClientRecord = WithId<ClientDocument>

function clients() {
  return collection<ClientDocument>(COLLECTIONS.clients)
}

/**
 * Forme canonique d'un numéro de téléphone.
 *
 * Le numéro identifie le client : « 07 12 34 56 78 » et « 0712345678 » doivent
 * désigner la même fiche, sans quoi le dédoublonnage laisserait passer un
 * doublon à la première saisie espacée.
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-.()]/g, '')
}

/** Complétude du dossier : les deux faces sont-elles déposées ? */
function resolveDocumentsStatus(front: string | null, back: string | null) {
  return front && back ? ('complete' as const) : ('pending' as const)
}

export interface ClientFilters {
  owner_id: string
  status?: ClientStatus
}

const Client = {
  async findById(id: string): Promise<ClientRecord | null> {
    if (!id) return null
    return toDoc<ClientDocument>(await clients().doc(id).get())
  },

  /**
   * Fiche d'un propriétaire portant ce numéro.
   *
   * Firestore n'ayant pas d'index unique, l'unicité de `(owner_id, phone)` est
   * applicative : cette lecture est le contrôle qui la porte.
   */
  async findByPhone(ownerId: string, phone: string): Promise<ClientRecord | null> {
    const snapshot = await clients()
      .where('owner_id', '==', ownerId)
      .where('phone', '==', normalizePhone(phone))
      .limit(1)
      .get()

    if (snapshot.empty) return null
    return toDoc<ClientDocument>(snapshot.docs[0])
  },

  async create(input: {
    owner_id: string
    full_name: string
    phone: string
    whatsapp?: string | null
    id_document_type?: ClientIdDocumentType | null
    id_document_number?: string | null
    id_document_front_public_id?: string | null
    id_document_back_public_id?: string | null
  }): Promise<ClientRecord> {
    const now = new Date()
    const front = input.id_document_front_public_id ?? null
    const back = input.id_document_back_public_id ?? null

    const payload: ClientDocument = {
      owner_id: input.owner_id,
      full_name: input.full_name,
      phone: normalizePhone(input.phone),
      whatsapp: input.whatsapp ? normalizePhone(input.whatsapp) : null,
      id_document_type: input.id_document_type ?? null,
      id_document_number: input.id_document_number ?? null,
      id_document_front_public_id: front,
      id_document_back_public_id: back,
      documents_status: resolveDocumentsStatus(front, back),
      stats: { total_stays: 0, total_paid: 0, last_stay_at: null },
      status: 'active',
      created_at: now,
      updated_at: now,
    }

    const docRef = await clients().add(toPayload(payload) as unknown as ClientDocument)
    return { ...payload, _id: docRef.id }
  },

  /**
   * Met à jour une fiche, restreinte à son propriétaire.
   *
   * Le périmètre est vérifié avant écriture : sans lui, un propriétaire
   * pourrait modifier la fiche d'un autre en devinant son identifiant.
   */
  async update(
    id: string,
    ownerId: string,
    patch: Partial<Omit<ClientDocument, 'owner_id' | 'created_at'>>
  ): Promise<ClientRecord | null> {
    const current = await Client.findById(id)
    if (!current || current.owner_id !== ownerId) return null

    const next = { ...patch, updated_at: new Date() } as Record<string, unknown>

    if (patch.phone) next.phone = normalizePhone(patch.phone)

    // La complétude se recalcule dès qu'une face bouge, sinon un dossier
    // complété resterait marqué « en attente ».
    if (
      'id_document_front_public_id' in patch ||
      'id_document_back_public_id' in patch
    ) {
      const front =
        patch.id_document_front_public_id ?? current.id_document_front_public_id ?? null
      const back =
        patch.id_document_back_public_id ?? current.id_document_back_public_id ?? null
      next.documents_status = resolveDocumentsStatus(front, back)
    }

    await clients().doc(id).update(toPayload(next))
    return Client.findById(id)
  },

  async paginate(
    filters: ClientFilters,
    options: { limit: number; offset: number }
  ): Promise<{ data: ClientRecord[]; total: number }> {
    let query = clients().where(
      'owner_id',
      '==',
      filters.owner_id
    ) as FirebaseFirestore.Query<ClientDocument>

    if (filters.status) query = query.where('status', '==', filters.status)

    const [snapshot, total] = await Promise.all([
      query.orderBy('updated_at', 'desc').offset(options.offset).limit(options.limit).get(),
      countQuery(query),
    ])

    return { data: toDocs<ClientDocument>(snapshot.docs), total }
  },

  /** Cumule un séjour sur la fiche, à la clôture d'une réservation. */
  async touchStats(id: string, amount: number, stayDate: Date): Promise<void> {
    const current = await Client.findById(id)
    if (!current) return

    await clients()
      .doc(id)
      .update(
        toPayload({
          stats: {
            total_stays: (current.stats?.total_stays ?? 0) + 1,
            total_paid: (current.stats?.total_paid ?? 0) + amount,
            last_stay_at: stayDate,
          },
          updated_at: new Date(),
        })
      )
  },
}

export default Client
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node ace test unit --files=client_normalization`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add app/models/client.ts app/firebase/firestore.ts tests/unit/models/client_normalization.spec.ts
git commit -m "feat: modele Firestore du carnet clients"
```

---

### Task 5: DTO, repository et use cases clients

**Files:**
- Create: `app/features/clients/dto/client.dto.ts`
- Create: `app/features/clients/repositories/client_repository.ts`
- Create: `app/features/clients/use_cases/create_client.use_case.ts`
- Create: `app/features/clients/use_cases/update_client.use_case.ts`
- Create: `app/features/clients/use_cases/list_clients.use_case.ts`
- Create: `app/features/clients/use_cases/get_client.use_case.ts`
- Create: `app/features/clients/use_cases/lookup_client.use_case.ts`
- Create: `app/features/clients/use_cases/index.ts`
- Test: `tests/unit/clients/client_dto.spec.ts`

**Interfaces:**
- Consumes: `Client`, `ClientRecord`, `normalizePhone` (Task 4) ; les fonctions d'upload et d'URL signée de `#services/document_storage`
- Produces:
  - `ClientDto`, `CreateClientInput`, `UpdateClientInput`, `ListClientsInput`, `ListClientsOutput`, `LookupClientOutput`
  - `ClientRepository.toDto(doc: ClientRecord): ClientDto`
  - `CreateClientUseCase.execute(input, files): Promise<{ client: ClientDto; already_existed: boolean }>`
  - `LookupClientUseCase.execute(ownerId, phone): Promise<LookupClientOutput>`

- [ ] **Step 1: Relever les exports exacts de `document_storage`**

Run: `grep -n "^export" app/services/document_storage.ts`

Noter les deux noms utilisés dans cette tâche : la fonction d'envoi (`uploadDocument`) et celle qui produit une URL signée. Si cette dernière porte un autre nom que `signedUrlFor`, employer le nom réel partout aux étapes 4 et 7.

- [ ] **Step 2: Write the failing test**

```typescript
// tests/unit/clients/client_dto.spec.ts
import { test } from '@japa/runner'
import { ClientRepository } from '#features/clients/repositories/client_repository'

import type { ClientRecord } from '#models/client'

const record: ClientRecord = {
  _id: 'client-1',
  owner_id: 'owner-1',
  full_name: 'Mohamed Traoré',
  phone: '0712345678',
  whatsapp: null,
  id_document_type: 'cni',
  id_document_number: 'CI-123',
  id_document_front_public_id: 'resi/clients/front',
  id_document_back_public_id: null,
  documents_status: 'pending',
  stats: { total_stays: 2, total_paid: 90000, last_stay_at: new Date('2026-08-01') },
  status: 'active',
  created_at: new Date('2026-07-01'),
  updated_at: new Date('2026-08-01'),
}

test.group('ClientRepository.toDto', () => {
  test('expose l’identifiant sous le nom `id`', ({ assert }) => {
    assert.equal(ClientRepository.toDto(record).id, 'client-1')
  })

  test('n’expose jamais les identifiants Cloudinary', ({ assert }) => {
    // Ce sont des références internes : les livrer permettrait de forger des
    // requêtes vers l'hébergeur en dehors des URLs signées.
    const dto = ClientRepository.toDto(record) as Record<string, unknown>
    assert.notProperty(dto, 'id_document_front_public_id')
    assert.notProperty(dto, 'id_document_back_public_id')
  })

  test('n’expose pas `owner_id`', ({ assert }) => {
    // La fiche est lue par son propre propriétaire : redire à qui elle
    // appartient n'apporte rien et expose la structure interne.
    const dto = ClientRepository.toDto(record) as Record<string, unknown>
    assert.notProperty(dto, 'owner_id')
  })

  test('signale la présence des pièces sans livrer leur référence', ({ assert }) => {
    const dto = ClientRepository.toDto(record)
    assert.isTrue(dto.has_document_front)
    assert.isFalse(dto.has_document_back)
    assert.equal(dto.documents_status, 'pending')
  })

  test('reporte les statistiques de séjour', ({ assert }) => {
    const dto = ClientRepository.toDto(record)
    assert.equal(dto.stats.total_stays, 2)
    assert.equal(dto.stats.total_paid, 90000)
  })

  test('une fiche sans statistiques ne fait pas échouer la lecture', ({ assert }) => {
    // Les fiches écrites avant l'ajout du bloc `stats` n'en portent pas.
    const legacy = { ...record, stats: undefined } as unknown as ClientRecord
    const dto = ClientRepository.toDto(legacy)
    assert.equal(dto.stats.total_stays, 0)
    assert.isNull(dto.stats.last_stay_at)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node ace test unit --files=client_dto`
Expected: FAIL — le module `#features/clients/repositories/client_repository` n'existe pas.

- [ ] **Step 4: Write the DTO**

```typescript
// app/features/clients/dto/client.dto.ts
import type { ClientIdDocumentType, ClientStatus } from '#models/client'

export interface ClientStatsDto {
  total_stays: number
  total_paid: number
  last_stay_at: Date | null
}

export interface ClientDto {
  id: string
  full_name: string
  phone: string
  whatsapp: string | null
  id_document_type: ClientIdDocumentType | null
  id_document_number: string | null
  /**
   * Présence des pièces, sans leur référence.
   *
   * L'application affiche un dossier complet ou en attente ; livrer le
   * `public_id` Cloudinary permettrait de forger des requêtes vers l'hébergeur
   * hors des URLs signées.
   */
  has_document_front: boolean
  has_document_back: boolean
  documents_status: 'complete' | 'pending'
  stats: ClientStatsDto
  status: ClientStatus
  created_at: Date
  updated_at: Date
  /** URLs signées, présentes seulement sur la lecture d'une fiche. */
  document_front_url?: string | null
  document_back_url?: string | null
}

export interface CreateClientInput {
  owner_id: string
  full_name: string
  phone: string
  whatsapp?: string | null
  id_document_type?: ClientIdDocumentType | null
  id_document_number?: string | null
}

export interface UpdateClientInput {
  full_name?: string
  phone?: string
  whatsapp?: string | null
  id_document_type?: ClientIdDocumentType | null
  id_document_number?: string | null
  status?: ClientStatus
}

export interface ListClientsInput {
  owner_id: string
  q?: string
  status?: ClientStatus
  page?: number
  per_page?: number
}

export interface ListClientsOutput {
  data: ClientDto[]
  meta: { total: number; perPage: number; currentPage: number; lastPage: number }
}

/**
 * Résultat du dédoublonnage.
 *
 * `exists: false` n'est pas une erreur : c'est le cas nominal d'un nouveau
 * client, et l'application enchaîne sur la saisie.
 */
export interface LookupClientOutput {
  exists: boolean
  client: ClientDto | null
}
```

- [ ] **Step 5: Write the repository**

```typescript
// app/features/clients/repositories/client_repository.ts
import Client, { type ClientRecord } from '#models/client'

import type {
  ClientDto,
  CreateClientInput,
  ListClientsInput,
  UpdateClientInput,
} from '../dto/client.dto.ts'

export class ClientRepository {
  static toDto(doc: ClientRecord): ClientDto {
    return {
      id: doc._id,
      full_name: doc.full_name,
      phone: doc.phone,
      whatsapp: doc.whatsapp ?? null,
      id_document_type: doc.id_document_type ?? null,
      id_document_number: doc.id_document_number ?? null,
      has_document_front: Boolean(doc.id_document_front_public_id),
      has_document_back: Boolean(doc.id_document_back_public_id),
      documents_status: doc.documents_status ?? 'pending',
      stats: {
        total_stays: doc.stats?.total_stays ?? 0,
        total_paid: doc.stats?.total_paid ?? 0,
        last_stay_at: doc.stats?.last_stay_at ?? null,
      },
      status: doc.status ?? 'active',
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    }
  }

  async findById(id: string, ownerId: string): Promise<ClientRecord | null> {
    const doc = await Client.findById(id)
    // Un identifiant deviné ne doit pas révéler la fiche d'un autre carnet.
    if (!doc || doc.owner_id !== ownerId) return null
    return doc
  }

  async findByPhone(ownerId: string, phone: string): Promise<ClientRecord | null> {
    return Client.findByPhone(ownerId, phone)
  }

  async create(
    input: CreateClientInput & {
      id_document_front_public_id?: string | null
      id_document_back_public_id?: string | null
    }
  ): Promise<ClientRecord> {
    return Client.create(input)
  }

  async update(
    id: string,
    ownerId: string,
    patch: UpdateClientInput & {
      id_document_front_public_id?: string | null
      id_document_back_public_id?: string | null
    }
  ): Promise<ClientRecord | null> {
    return Client.update(id, ownerId, patch)
  }

  /**
   * Page de clients, filtrée en mémoire sur le terme de recherche.
   *
   * Firestore ne sait pas chercher une sous-chaîne : `where('full_name', '>=')`
   * n'attrape qu'un préfixe, alors que le propriétaire cherche aussi bien par
   * nom que par numéro. Le carnet d'un propriétaire se compte en centaines de
   * fiches, ce qui rend le filtrage local sans incidence.
   */
  async paginate(input: ListClientsInput): Promise<{ data: ClientRecord[]; total: number }> {
    const page = Math.max(1, input.page ?? 1)
    const perPage = Math.min(100, Math.max(1, input.per_page ?? 20))
    const term = input.q?.trim().toLowerCase()

    if (!term) {
      return Client.paginate(
        { owner_id: input.owner_id, status: input.status },
        { limit: perPage, offset: (page - 1) * perPage }
      )
    }

    const all = await Client.paginate(
      { owner_id: input.owner_id, status: input.status },
      { limit: 1000, offset: 0 }
    )

    const matches = all.data.filter(
      (doc) =>
        doc.full_name.toLowerCase().includes(term) ||
        doc.phone.includes(term.replace(/\s/g, ''))
    )

    return {
      data: matches.slice((page - 1) * perPage, page * perPage),
      total: matches.length,
    }
  }
}

export default ClientRepository
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node ace test unit --files=client_dto`
Expected: PASS — 6 tests.

- [ ] **Step 7: Write the use cases**

```typescript
// app/features/clients/use_cases/create_client.use_case.ts
import { uploadDocument } from '#services/document_storage'

import type { MultipartFile } from '@adonisjs/core/bodyparser'

import type { ClientDto, CreateClientInput } from '../dto/client.dto.ts'
import ClientRepository from '../repositories/client_repository.ts'

/**
 * Enregistre un client au carnet du propriétaire.
 *
 * Les pièces d'identité sont facultatives : au comptoir, un client peut ne pas
 * avoir sa pièce sur lui, et bloquer l'enregistrement bloquerait une entrée
 * d'argent. La fiche porte alors `documents_status: 'pending'`, que
 * l'application signale pour relance.
 */
export class CreateClientUseCase {
  constructor(private repo: ClientRepository = new ClientRepository()) {}

  async execute(
    input: CreateClientInput,
    files: { front?: MultipartFile | null; back?: MultipartFile | null } = {}
  ): Promise<{ client: ClientDto; already_existed: boolean }> {
    // Le numéro identifie le client : plutôt qu'une erreur, on retourne la
    // fiche existante pour que l'application propose de la réutiliser.
    const existing = await this.repo.findByPhone(input.owner_id, input.phone)
    if (existing) {
      return { client: ClientRepository.toDto(existing), already_existed: true }
    }

    const stamp = Date.now()
    const front = files.front
      ? await uploadDocument(files.front, `clients/${input.owner_id}/${stamp}-front`)
      : null
    const back = files.back
      ? await uploadDocument(files.back, `clients/${input.owner_id}/${stamp}-back`)
      : null

    const created = await this.repo.create({
      ...input,
      id_document_front_public_id: front,
      id_document_back_public_id: back,
    })

    return { client: ClientRepository.toDto(created), already_existed: false }
  }
}

export default CreateClientUseCase
```

```typescript
// app/features/clients/use_cases/lookup_client.use_case.ts
import type { LookupClientOutput } from '../dto/client.dto.ts'
import ClientRepository from '../repositories/client_repository.ts'

/**
 * Dédoublonnage par téléphone, appelé pendant la saisie.
 *
 * Répond toujours 200, y compris quand le client est inconnu : l'absence de
 * fiche est le cas nominal d'un nouveau client, pas une erreur.
 */
export class LookupClientUseCase {
  constructor(private repo: ClientRepository = new ClientRepository()) {}

  async execute(ownerId: string, phone: string): Promise<LookupClientOutput> {
    const found = await this.repo.findByPhone(ownerId, phone)
    return {
      exists: Boolean(found),
      client: found ? ClientRepository.toDto(found) : null,
    }
  }
}

export default LookupClientUseCase
```

```typescript
// app/features/clients/use_cases/list_clients.use_case.ts
import type { ListClientsInput, ListClientsOutput } from '../dto/client.dto.ts'
import ClientRepository from '../repositories/client_repository.ts'

export class ListClientsUseCase {
  constructor(private repo: ClientRepository = new ClientRepository()) {}

  async execute(input: ListClientsInput): Promise<ListClientsOutput> {
    const page = Math.max(1, input.page ?? 1)
    const perPage = Math.min(100, Math.max(1, input.per_page ?? 20))

    const { data, total } = await this.repo.paginate(input)

    return {
      data: data.map(ClientRepository.toDto),
      meta: {
        total,
        perPage,
        currentPage: page,
        lastPage: Math.max(1, Math.ceil(total / perPage)),
      },
    }
  }
}

export default ListClientsUseCase
```

```typescript
// app/features/clients/use_cases/get_client.use_case.ts
import { signedUrlFor } from '#services/document_storage'
import { DomainError } from '#utils/domain_error'

import type { ClientDto } from '../dto/client.dto.ts'
import ClientRepository from '../repositories/client_repository.ts'

/**
 * Fiche complète, avec URLs signées vers les pièces déposées.
 *
 * Les URLs sont régénérées à chaque lecture : elles expirent, et les persister
 * produirait des liens morts au premier affichage différé.
 */
export class GetClientUseCase {
  constructor(private repo: ClientRepository = new ClientRepository()) {}

  async execute(id: string, ownerId: string): Promise<ClientDto> {
    const doc = await this.repo.findById(id, ownerId)
    if (!doc) {
      throw new DomainError('client_not_found', 'Client introuvable.', 404)
    }

    const dto = ClientRepository.toDto(doc)

    return {
      ...dto,
      document_front_url: doc.id_document_front_public_id
        ? await signedUrlFor(doc.id_document_front_public_id)
        : null,
      document_back_url: doc.id_document_back_public_id
        ? await signedUrlFor(doc.id_document_back_public_id)
        : null,
    }
  }
}

export default GetClientUseCase
```

```typescript
// app/features/clients/use_cases/update_client.use_case.ts
import { uploadDocument } from '#services/document_storage'
import { DomainError } from '#utils/domain_error'

import type { MultipartFile } from '@adonisjs/core/bodyparser'

import type { ClientDto, UpdateClientInput } from '../dto/client.dto.ts'
import ClientRepository from '../repositories/client_repository.ts'

export class UpdateClientUseCase {
  constructor(private repo: ClientRepository = new ClientRepository()) {}

  async execute(
    id: string,
    ownerId: string,
    input: UpdateClientInput,
    files: { front?: MultipartFile | null; back?: MultipartFile | null } = {}
  ): Promise<ClientDto> {
    // Changer un numéro pour celui d'une autre fiche fusionnerait deux clients
    // distincts sans que rien ne le signale.
    if (input.phone) {
      const clash = await this.repo.findByPhone(ownerId, input.phone)
      if (clash && clash._id !== id) {
        throw new DomainError(
          'client_phone_taken',
          'Un autre client du carnet porte déjà ce numéro.',
          422
        )
      }
    }

    const stamp = Date.now()
    const front = files.front
      ? await uploadDocument(files.front, `clients/${ownerId}/${stamp}-front`)
      : undefined
    const back = files.back
      ? await uploadDocument(files.back, `clients/${ownerId}/${stamp}-back`)
      : undefined

    const updated = await this.repo.update(id, ownerId, {
      ...input,
      ...(front !== undefined ? { id_document_front_public_id: front } : {}),
      ...(back !== undefined ? { id_document_back_public_id: back } : {}),
    })

    if (!updated) {
      throw new DomainError('client_not_found', 'Client introuvable.', 404)
    }

    return ClientRepository.toDto(updated)
  }
}

export default UpdateClientUseCase
```

```typescript
// app/features/clients/use_cases/index.ts
export { default as CreateClientUseCase } from './create_client.use_case.ts'
export { default as GetClientUseCase } from './get_client.use_case.ts'
export { default as ListClientsUseCase } from './list_clients.use_case.ts'
export { default as LookupClientUseCase } from './lookup_client.use_case.ts'
export { default as UpdateClientUseCase } from './update_client.use_case.ts'
```

- [ ] **Step 8: Vérifier la compilation**

Run: `npm run typecheck`
Expected: aucune erreur. Si la fonction d'URL signée porte un autre nom que `signedUrlFor`, corriger avec celui relevé à l'étape 1.

- [ ] **Step 9: Commit**

```bash
git add app/features/clients tests/unit/clients
git commit -m "feat: dto, repository et use cases du carnet clients"
```

---

### Task 6: Validateurs et contrôleur clients

**Files:**
- Create: `app/validators/client/client.ts`
- Create: `app/controllers/proprio/client_controller.ts`
- Modify: `start/routes.ts`

**Interfaces:**
- Consumes: les use cases de la Task 5
- Produces: les routes `/api/v1/proprio/clients`

- [ ] **Step 1: Relever les conventions de validation existantes**

Run: `sed -n '1,60p' app/validators/owner/owner_profile.ts`

Reprendre la façon dont les fichiers multipart y sont déclarés : les pièces client suivent exactement le même schéma.

- [ ] **Step 2: Write the validators**

```typescript
// app/validators/client/client.ts
import { CLIENT_STATUSES, ID_DOCUMENT_TYPES } from '#models/client'
import vine from '@vinejs/vine'

/** Formats acceptés pour une pièce, alignés sur `document_storage`. */
const documentFile = vine.file({
  size: '5mb',
  extnames: ['jpg', 'jpeg', 'png', 'webp'],
})

export const createClientValidator = vine.compile(
  vine.object({
    full_name: vine.string().trim().minLength(2).maxLength(120),
    phone: vine.string().trim().minLength(8).maxLength(20),
    whatsapp: vine.string().trim().minLength(8).maxLength(20).optional(),
    id_document_type: vine.enum(ID_DOCUMENT_TYPES).optional(),
    id_document_number: vine.string().trim().maxLength(50).optional(),
    id_document_front: documentFile.clone().optional(),
    id_document_back: documentFile.clone().optional(),
  })
)

export const updateClientValidator = vine.compile(
  vine.object({
    full_name: vine.string().trim().minLength(2).maxLength(120).optional(),
    phone: vine.string().trim().minLength(8).maxLength(20).optional(),
    whatsapp: vine.string().trim().minLength(8).maxLength(20).nullable().optional(),
    id_document_type: vine.enum(ID_DOCUMENT_TYPES).nullable().optional(),
    id_document_number: vine.string().trim().maxLength(50).nullable().optional(),
    status: vine.enum(CLIENT_STATUSES).optional(),
    id_document_front: documentFile.clone().optional(),
    id_document_back: documentFile.clone().optional(),
  })
)

export const listClientsValidator = vine.compile(
  vine.object({
    q: vine.string().trim().maxLength(100).optional(),
    status: vine.enum(CLIENT_STATUSES).optional(),
    page: vine.number().min(1).withoutDecimals().optional(),
    per_page: vine.number().min(1).max(100).withoutDecimals().optional(),
  })
)

export const lookupClientValidator = vine.compile(
  vine.object({
    phone: vine.string().trim().minLength(8).maxLength(20),
  })
)
```

- [ ] **Step 3: Write the controller**

```typescript
// app/controllers/proprio/client_controller.ts
import {
  createClientValidator,
  listClientsValidator,
  lookupClientValidator,
  updateClientValidator,
} from '#validators/client/client'

import type { HttpContext } from '@adonisjs/core/http'

import {
  CreateClientUseCase,
  GetClientUseCase,
  ListClientsUseCase,
  LookupClientUseCase,
  UpdateClientUseCase,
} from '../../features/clients/use_cases/index.ts'

/** Carnet de clients du propriétaire connecté. */
export default class ProprioClientController {
  async index(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(listClientsValidator, {
      data: ctx.request.qs(),
    })
    const result = await new ListClientsUseCase().execute({ ...payload, owner_id: userId })
    return ctx.response.ok(result)
  }

  async store(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(createClientValidator)

    const { client, already_existed } = await new CreateClientUseCase().execute(
      {
        owner_id: userId,
        full_name: payload.full_name,
        phone: payload.phone,
        whatsapp: payload.whatsapp,
        id_document_type: payload.id_document_type,
        id_document_number: payload.id_document_number,
      },
      { front: payload.id_document_front, back: payload.id_document_back }
    )

    // 200 et non 201 quand la fiche existait : rien n'a été créé, et
    // l'application doit pouvoir proposer de réutiliser la fiche trouvée.
    return already_existed
      ? ctx.response.ok({ data: client, already_existed: true })
      : ctx.response.created({ data: client, already_existed: false })
  }

  async show(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const client = await new GetClientUseCase().execute(ctx.params.id, userId)
    return ctx.response.ok({ data: client })
  }

  async update(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(updateClientValidator)

    const client = await new UpdateClientUseCase().execute(
      ctx.params.id,
      userId,
      {
        full_name: payload.full_name,
        phone: payload.phone,
        whatsapp: payload.whatsapp,
        id_document_type: payload.id_document_type,
        id_document_number: payload.id_document_number,
        status: payload.status,
      },
      { front: payload.id_document_front, back: payload.id_document_back }
    )

    return ctx.response.ok({ data: client })
  }

  async lookup(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(lookupClientValidator)
    const result = await new LookupClientUseCase().execute(userId, payload.phone)
    return ctx.response.ok(result)
  }
}
```

- [ ] **Step 4: Register the routes**

Dans `start/routes.ts`, ajouter l'import près des autres contrôleurs proprio :

```typescript
const ProprioClientController = () => import('#controllers/proprio/client_controller')
```

Puis, dans le groupe `proprio`, après le groupe `bookings` :

```typescript
        router
          .group(() => {
            router.get('/', [ProprioClientController, 'index'])
            // Avant `:id`, sinon « lookup » serait pris pour un identifiant.
            router.post('lookup', [ProprioClientController, 'lookup'])
            router.post('/', [ProprioClientController, 'store'])
            router.get(':id', [ProprioClientController, 'show'])
            router.patch(':id', [ProprioClientController, 'update'])
          })
          .prefix('clients')
          .as('clients')
```

- [ ] **Step 5: Vérifier la compilation et les routes**

Run: `npm run typecheck && node ace list:routes | grep clients`
Expected: aucune erreur de type, et cinq routes `proprio.clients.*` listées.

- [ ] **Step 6: Commit**

```bash
git add app/validators/client app/controllers/proprio/client_controller.ts start/routes.ts
git commit -m "feat: routes du carnet clients cote proprietaire"
```

---

### Task 7: Étendre le modèle `booking`

**Files:**
- Modify: `app/models/booking.ts`
- Modify: `firestore.indexes.json`
- Test: `tests/unit/bookings/booking_status.spec.ts`

**Interfaces:**
- Consumes: `StayType` (Task 1)
- Produces:
  - `BOOKING_STATUSES` étendu de `in_progress`
  - `BookingDocument` étendu : `source`, `client_snapshot`, `stay_type`, `check_in_at`, `check_out_at`, `expected_amount`, `received_amount`, `deposit_amount`, `client_request_id`, `sync_status`
  - `Booking.findByRequestId(ownerId, requestId): Promise<BookingRecord | null>`
  - `Booking.findActiveForProperty(propertyId, from): Promise<BookingRecord[]>`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/bookings/booking_status.spec.ts
import { test } from '@japa/runner'
import { BOOKING_STATUSES } from '#models/booking'

test.group('BOOKING_STATUSES', () => {
  test('inclut le séjour en cours', ({ assert }) => {
    // Un check-in crée directement une réservation en cours : le client est
    // déjà dans le logement, « confirmed » décrirait mal la situation.
    assert.include([...BOOKING_STATUSES], 'in_progress')
  })

  test('conserve les statuts existants', ({ assert }) => {
    // Des documents les portent déjà ; les retirer rendrait leur lecture
    // invalide.
    assert.include([...BOOKING_STATUSES], 'confirmed')
    assert.include([...BOOKING_STATUSES], 'cancelled')
    assert.include([...BOOKING_STATUSES], 'completed')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test unit --files=booking_status`
Expected: FAIL — `in_progress` absent de `BOOKING_STATUSES`.

- [ ] **Step 3: Étendre les statuts et importer `StayType`**

Dans `app/models/booking.ts`, remplacer la ligne des statuts :

```typescript
const BOOKING_STATUSES = ['confirmed', 'in_progress', 'cancelled', 'completed'] as const
```

Et ajouter en tête du fichier :

```typescript
import type { StayType } from '#features/bookings/stay_type'
```

- [ ] **Step 4: Étendre `BookingDocument`**

Ajouter à l'interface `BookingDocument`, après `message`, en conservant le reste :

```typescript
  /**
   * Canal de vente. `offline` désigne une réservation prise au comptoir, par
   * opposition à `online` prise par un client via l'application. Ne change
   * jamais — à ne pas confondre avec `sync_status`, qui dit si une saisie sans
   * réseau est parvenue au serveur.
   *
   * Optionnel en lecture : les réservations antérieures n'en portent pas et
   * valent `online`.
   */
  source?: 'online' | 'offline'

  /**
   * Nom et téléphone figés à la réservation.
   *
   * Une fiche client renommée ou archivée ne doit pas réécrire l'historique —
   * même logique que `daily_price`, figé au tarif du jour.
   */
  client_snapshot?: { full_name: string; phone: string } | null

  stay_type?: StayType

  /**
   * Doublent `start_date` / `end_date` avec une précision à l'heure. Les deux
   * couples sont écrits ensemble et tenus identiques : les champs d'origine
   * restent la source pour Finance et les écrans existants.
   */
  check_in_at?: Date
  check_out_at?: Date

  /** Montant calculé depuis la grille du bien, avant négociation. */
  expected_amount?: number
  /** Montant réellement convenu, saisi par le propriétaire. */
  received_amount?: number
  deposit_amount?: number

  /**
   * UUID généré par l'appareil, qui rend la création idempotente.
   *
   * Sans lui, un timeout suivi d'un retry — ordinaire sur réseau instable —
   * créerait deux réservations pour un seul client et fausserait la
   * comptabilité de façon invisible.
   */
  client_request_id?: string | null
  sync_status?: 'synced' | 'pending' | 'conflict'
```

- [ ] **Step 5: Ajouter les deux lectures**

Dans l'objet `Booking`, après `hasActiveBooking` :

```typescript
  /**
   * Réservation portant cet identifiant de requête, s'il en existe une.
   *
   * Porte l'idempotence : avant de créer, on vérifie qu'un retry n'a pas déjà
   * abouti. Restreinte au propriétaire, l'identifiant d'un autre compte ne
   * devant jamais être observable.
   */
  async findByRequestId(ownerId: string, requestId: string): Promise<BookingRecord | null> {
    if (!requestId) return null

    const snapshot = await bookings()
      .where('owner_id', '==', ownerId)
      .where('client_request_id', '==', requestId)
      .limit(1)
      .get()

    if (snapshot.empty) return null
    return toDoc<BookingDocument>(snapshot.docs[0])
  },

  /**
   * Réservations d'un bien pouvant encore l'immobiliser.
   *
   * Firestore n'accepte qu'un champ en inégalité par requête, or le
   * chevauchement en exige deux (`check_in_at` et `check_out_at`). On filtre
   * donc sur la seule borne de sortie, le chevauchement exact étant évalué en
   * mémoire par `findOverlappingPeriod`. Le volume — les réservations non
   * terminées d'un seul bien — rend le compromis sans incidence.
   */
  async findActiveForProperty(propertyId: string, from: Date): Promise<BookingRecord[]> {
    const snapshot = await bookings()
      .where('property_id', '==', propertyId)
      .where('check_out_at', '>', from)
      .get()

    return toDocs<BookingDocument>(snapshot.docs)
  },
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node ace test unit --files=booking_status && npm run typecheck`
Expected: PASS — 2 tests, et aucune erreur de type.

- [ ] **Step 7: Déclarer les index Firestore**

`findActiveForProperty` et `findByRequestId` combinent égalité et inégalité, ou deux égalités : Firestore exige des index composites. Ajouter au tableau `indexes` de `firestore.indexes.json` :

```json
    {
      "collectionGroup": "bookings",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "property_id", "order": "ASCENDING" },
        { "fieldPath": "check_out_at", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "bookings",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "owner_id", "order": "ASCENDING" },
        { "fieldPath": "client_request_id", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "clients",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "owner_id", "order": "ASCENDING" },
        { "fieldPath": "phone", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "clients",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "owner_id", "order": "ASCENDING" },
        { "fieldPath": "updated_at", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "clients",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "owner_id", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "updated_at", "order": "DESCENDING" }
      ]
    }
```

- [ ] **Step 8: Commit**

```bash
git add app/models/booking.ts firestore.indexes.json tests/unit/bookings/booking_status.spec.ts
git commit -m "feat: etendre le modele booking pour les reservations comptoir"
```

---

### Task 8: Création d'une réservation comptoir

Tâche centrale : elle assemble les fonctions pures des tâches 1 à 3 et le carnet de la tâche 5.

**Files:**
- Create: `app/features/bookings/use_cases/create_owner_booking.use_case.ts`
- Modify: `app/features/bookings/dto/booking.dto.ts`
- Modify: `app/features/bookings/repositories/booking_repository.ts`
- Modify: `app/models/booking.ts`
- Test: `tests/unit/bookings/owner_booking_pricing.spec.ts`

**Interfaces:**
- Consumes: `resolveStayTypePrice`, `defaultCheckOutFor` (Task 1) ; `findOverlappingPeriod` (Task 3) ; `Client` (Task 4) ; `Booking.findByRequestId`, `Booking.findActiveForProperty` (Task 7)
- Produces:
  - `CreateOwnerBookingInput`, `BookingClientSummary`
  - `computeOwnerBookingAmounts(pricing, stayType, checkIn, checkOut): { days: number; expected: number }`
  - `CreateOwnerBookingUseCase.execute(input): Promise<BookingDto>`
  - `Booking.createOwnerBooking(input): Promise<BookingRecord>`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/bookings/owner_booking_pricing.spec.ts
import { test } from '@japa/runner'
import { computeOwnerBookingAmounts } from '#features/bookings/use_cases/create_owner_booking.use_case'

import type { PropertyPricing } from '#models/property'

const pricing: PropertyPricing = {
  daily_price: 20000,
  price_tiers: [],
  minimum_stay_days: 1,
  maximum_stay_days: null,
}

test.group('computeOwnerBookingAmounts', () => {
  test('un séjour complet de trois jours facture trois journées', ({ assert }) => {
    const result = computeOwnerBookingAmounts(
      pricing,
      'full_day',
      new Date('2026-10-28T12:00:00Z'),
      new Date('2026-10-31T12:00:00Z')
    )
    assert.equal(result.days, 3)
    assert.equal(result.expected, 60000)
  })

  test('une demi-journée facture la moitié du tarif journalier', ({ assert }) => {
    const result = computeOwnerBookingAmounts(
      pricing,
      'half_day',
      new Date('2026-10-28T12:00:00Z'),
      new Date('2026-10-29T00:00:00Z')
    )
    assert.equal(result.expected, 10000)
  })

  test('un passage facture 30 % du tarif journalier', ({ assert }) => {
    const result = computeOwnerBookingAmounts(
      pricing,
      'passage',
      new Date('2026-10-28T14:00:00Z'),
      new Date('2026-10-28T18:00:00Z')
    )
    assert.equal(result.expected, 6000)
  })

  test('un séjour infra-journalier compte au moins un jour facturé', ({ assert }) => {
    // `days_count` alimente Finance et l'affichage existant : une valeur nulle
    // y ferait disparaître la réservation.
    const result = computeOwnerBookingAmounts(
      pricing,
      'passage',
      new Date('2026-10-28T14:00:00Z'),
      new Date('2026-10-28T18:00:00Z')
    )
    assert.equal(result.days, 1)
  })

  test('une sortie antérieure à l’entrée est refusée', ({ assert }) => {
    assert.throws(() =>
      computeOwnerBookingAmounts(
        pricing,
        'full_day',
        new Date('2026-10-28T12:00:00Z'),
        new Date('2026-10-27T12:00:00Z')
      )
    )
  })

  test('le minimum de séjour ne s’applique pas à une demi-journée', ({ assert }) => {
    // `minimum_stay_days` vaut 1 par défaut : l'y soumettre rendrait la
    // demi-journée impossible sur tout bien existant.
    const strict: PropertyPricing = { ...pricing, minimum_stay_days: 2 }
    const result = computeOwnerBookingAmounts(
      strict,
      'half_day',
      new Date('2026-10-28T12:00:00Z'),
      new Date('2026-10-29T00:00:00Z')
    )
    assert.equal(result.expected, 10000)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test unit --files=owner_booking_pricing`
Expected: FAIL — le module n'existe pas.

- [ ] **Step 3: Étendre le DTO**

Dans `app/features/bookings/dto/booking.dto.ts`, ajouter en tête :

```typescript
import type { StayType } from '../stay_type.ts'
```

Puis ces déclarations :

```typescript
export interface BookingClientSummary {
  id: string
  full_name: string
  phone: string
}

export interface CreateOwnerBookingInput {
  owner_id: string
  property_id: string
  client_id: string
  stay_type: StayType
  check_in_at: Date
  /** À défaut, dérivée du type de séjour. */
  check_out_at?: Date
  /** Montant convenu avec le client. À défaut, le montant attendu s'applique. */
  received_amount?: number
  deposit_amount?: number
  message?: string
  /** Immédiat : la réservation naît `in_progress`. */
  is_check_in: boolean
  client_request_id?: string | null
}
```

Et ajouter à `BookingDto`, après `property?` :

```typescript
  source?: 'online' | 'offline'
  stay_type?: StayType
  check_in_at?: Date
  check_out_at?: Date
  expected_amount?: number
  received_amount?: number
  deposit_amount?: number
  sync_status?: 'synced' | 'pending' | 'conflict'
  /** Résumé du client, joint à la liste du propriétaire. */
  client?: BookingClientSummary
```

- [ ] **Step 4: Étendre `BookingRepository.toDto`**

Dans `booking_repository.ts`, ajouter au retour de `toDto`, après `updated_at` :

```typescript
      // Les réservations antérieures ne portent pas ces champs : le repli les
      // ramène au comportement d'origine plutôt que de livrer `undefined`.
      source: doc.source ?? 'online',
      stay_type: doc.stay_type ?? 'full_day',
      check_in_at: doc.check_in_at ?? doc.start_date,
      check_out_at: doc.check_out_at ?? doc.end_date,
      expected_amount: doc.expected_amount ?? doc.total_amount,
      received_amount: doc.received_amount ?? doc.total_amount,
      deposit_amount: doc.deposit_amount ?? 0,
      sync_status: doc.sync_status ?? 'synced',
      client: doc.client_snapshot
        ? {
            id: doc.client_id,
            full_name: doc.client_snapshot.full_name,
            phone: doc.client_snapshot.phone,
          }
        : undefined,
```

- [ ] **Step 5: Ajouter `createOwnerBooking` au modèle**

Dans `app/models/booking.ts`, dans l'objet `Booking` :

```typescript
  /**
   * Crée une réservation comptoir.
   *
   * Le bien n'est pas basculé en `reserved` : sa disponibilité se déduit
   * désormais des dates, ce qui laisse vendable un bien réservé pour dans trois
   * mois et le libère seul à la fin du séjour.
   *
   * `total_amount` reçoit le montant négocié : c'est lui qui a été encaissé, et
   * c'est donc lui que le chiffre d'affaires doit refléter.
   */
  async createOwnerBooking(input: {
    owner_id: string
    property_id: string
    client_id: string
    client_snapshot: { full_name: string; phone: string }
    status: BookingStatus
    stay_type: StayType
    check_in_at: Date
    check_out_at: Date
    days_count: number
    daily_price: number
    expected_amount: number
    received_amount: number
    deposit_amount: number
    message: string | null
    client_request_id: string | null
  }): Promise<BookingRecord> {
    const now = new Date()

    const payload: BookingDocument = {
      property_id: input.property_id,
      owner_id: input.owner_id,
      client_id: input.client_id,
      status: input.status,
      // Les deux couples de dates sont écrits ensemble et tenus identiques :
      // `start_date` reste la source pour Finance et les écrans existants.
      start_date: input.check_in_at,
      end_date: input.check_out_at,
      check_in_at: input.check_in_at,
      check_out_at: input.check_out_at,
      days_count: input.days_count,
      daily_price: input.daily_price,
      duration_discount_percent: 0,
      subtotal_amount: input.expected_amount,
      // L'écart entre attendu et négocié est une remise consentie.
      discount_amount: Math.max(0, input.expected_amount - input.received_amount),
      total_amount: input.received_amount,
      expected_amount: input.expected_amount,
      received_amount: input.received_amount,
      deposit_amount: input.deposit_amount,
      promo_code: null,
      message: input.message,
      source: 'offline',
      stay_type: input.stay_type,
      client_snapshot: input.client_snapshot,
      client_request_id: input.client_request_id,
      sync_status: 'synced',
      cancelled_at: null,
      completed_at: null,
      cancellation_reason: null,
      created_at: now,
      updated_at: now,
    }

    const docRef = await bookings().add(toPayload(payload) as unknown as BookingDocument)
    return { ...payload, _id: docRef.id }
  },
```

- [ ] **Step 6: Write the use case**

```typescript
// app/features/bookings/use_cases/create_owner_booking.use_case.ts
import Booking from '#models/booking'
import Client from '#models/client'
import Property from '#models/property'
import { DomainError } from '#utils/domain_error'

import type { PropertyPricing } from '#models/property'

import { findOverlappingPeriod } from '../availability.ts'
import { countStayDays } from '../stay_pricing.ts'
import { defaultCheckOutFor, resolveStayTypePrice, type StayType } from '../stay_type.ts'
import BookingRepository from '../repositories/booking_repository.ts'

import type { BookingDto, CreateOwnerBookingInput } from '../dto/booking.dto.ts'

/**
 * Montant attendu d'un séjour comptoir.
 *
 * Distinct de `calculateStayPrice`, qui sert le flux en ligne : celui-ci ne
 * connaît qu'un séjour complet remisé par durée, alors qu'une réservation
 * comptoir peut être infra-journalière et se conclut sur un prix négocié.
 *
 * `minimum_stay_days` n'est pas appliqué hors séjour complet : il vaut 1 par
 * défaut, et l'y soumettre rendrait la demi-journée impossible sur tout bien
 * existant.
 */
export function computeOwnerBookingAmounts(
  pricing: PropertyPricing,
  stayType: StayType,
  checkIn: Date,
  checkOut: Date
): { days: number; expected: number } {
  if (checkOut.getTime() <= checkIn.getTime()) {
    throw new DomainError(
      'invalid_stay_dates',
      'La date de sortie doit être postérieure à la date d’entrée.',
      422
    )
  }

  const unitPrice = resolveStayTypePrice(pricing, stayType)

  if (stayType !== 'full_day') {
    // Une demi-journée ou un passage se facture à l'unité ; `days_count` vaut
    // 1 pour rester lisible par Finance et les écrans existants.
    return { days: 1, expected: unitPrice }
  }

  const days = Math.max(1, countStayDays(checkIn, checkOut))

  const minimum = pricing.minimum_stay_days ?? 1
  if (days < minimum) {
    throw new DomainError('minimum_stay_not_reached', `Séjour minimum de ${minimum} jour(s).`, 422)
  }

  return { days, expected: Math.round(days * unitPrice) }
}

/**
 * Enregistre une réservation prise au comptoir.
 *
 * Distinct de `CreateBookingUseCase` : les deux ne partagent ni les règles ni
 * les entrées. Le flux client valide un code promo et refuse qu'un
 * propriétaire réserve son propre bien ; celui-ci gère l'acompte, le montant
 * négocié et l'idempotence.
 */
export class CreateOwnerBookingUseCase {
  async execute(input: CreateOwnerBookingInput): Promise<BookingDto> {
    // Idempotence avant toute écriture : un retry après timeout ne doit pas
    // produire une seconde réservation.
    if (input.client_request_id) {
      const existing = await Booking.findByRequestId(input.owner_id, input.client_request_id)
      if (existing) return BookingRepository.toDto(existing)
    }

    const property = await Property.findById(input.property_id)
    if (!property || property.owner_id !== input.owner_id) {
      throw new DomainError('property_not_found', 'Bien introuvable.', 404)
    }

    const client = await Client.findById(input.client_id)
    if (!client || client.owner_id !== input.owner_id) {
      throw new DomainError('client_not_found', 'Client introuvable.', 404)
    }

    const checkIn = input.check_in_at
    const checkOut = input.check_out_at ?? defaultCheckOutFor(input.stay_type, checkIn)

    const { days, expected } = computeOwnerBookingAmounts(
      property.pricing,
      input.stay_type,
      checkIn,
      checkOut
    )

    // La disponibilité se déduit des dates : on ne lit que les réservations
    // dont la sortie tombe après l'entrée demandée.
    const active = await Booking.findActiveForProperty(input.property_id, checkIn)
    const clash = findOverlappingPeriod(
      { check_in_at: checkIn, check_out_at: checkOut },
      active.map((doc) => ({
        check_in_at: doc.check_in_at ?? doc.start_date,
        check_out_at: doc.check_out_at ?? doc.end_date,
        status: doc.status,
      }))
    )

    if (clash) {
      throw new DomainError(
        'booking_period_conflict',
        'Ce bien est déjà réservé sur cette période.',
        409
      )
    }

    const created = await Booking.createOwnerBooking({
      owner_id: input.owner_id,
      property_id: input.property_id,
      client_id: input.client_id,
      client_snapshot: { full_name: client.full_name, phone: client.phone },
      status: input.is_check_in ? 'in_progress' : 'confirmed',
      stay_type: input.stay_type,
      check_in_at: checkIn,
      check_out_at: checkOut,
      days_count: days,
      daily_price: property.pricing.daily_price,
      expected_amount: expected,
      received_amount: input.received_amount ?? expected,
      deposit_amount: input.deposit_amount ?? 0,
      message: input.message ?? null,
      client_request_id: input.client_request_id ?? null,
    })

    return BookingRepository.toDto(created)
  }
}

export default CreateOwnerBookingUseCase
```

- [ ] **Step 7: Run test to verify it passes**

Run: `node ace test unit --files=owner_booking_pricing && npm run typecheck`
Expected: PASS — 6 tests, aucune erreur de type.

- [ ] **Step 8: Commit**

```bash
git add app/features/bookings app/models/booking.ts tests/unit/bookings/owner_booking_pricing.spec.ts
git commit -m "feat: creation d'une reservation comptoir avec idempotence"
```

---

### Task 9: Routes de réservation côté propriétaire

**Files:**
- Create: `app/features/bookings/use_cases/check_out_booking.use_case.ts`
- Modify: `app/features/bookings/use_cases/index.ts`
- Modify: `app/validators/booking/booking.ts`
- Modify: `app/controllers/proprio/booking_controller.ts`
- Modify: `start/routes.ts`

**Interfaces:**
- Consumes: `CreateOwnerBookingUseCase` (Task 8), `Client.touchStats` (Task 4), `STAY_TYPES` (Task 1)
- Produces: `POST /proprio/bookings`, `PATCH /proprio/bookings/:id/check-out`

- [ ] **Step 1: Write the validators**

Ajouter à `app/validators/booking/booking.ts` :

```typescript
import { STAY_TYPES } from '#features/bookings/stay_type'

export const createOwnerBookingValidator = vine.compile(
  vine.object({
    property_id: vine.string().trim().minLength(1),
    client_id: vine.string().trim().minLength(1),
    stay_type: vine.enum(STAY_TYPES),
    check_in_at: vine.date({ formats: { utc: true } }),
    check_out_at: vine.date({ formats: { utc: true } }).optional(),
    received_amount: vine.number().min(0).optional(),
    deposit_amount: vine.number().min(0).optional(),
    message: vine.string().trim().maxLength(500).optional(),
    is_check_in: vine.boolean().optional(),
    /** UUID généré par l'appareil ; porte l'idempotence de la synchronisation. */
    client_request_id: vine.string().trim().maxLength(64).optional(),
  })
)

export const availabilityValidator = vine.compile(
  vine.object({
    property_id: vine.string().trim().minLength(1),
    from: vine.date({ formats: { utc: true } }).optional(),
    to: vine.date({ formats: { utc: true } }).optional(),
  })
)
```

Si `vine.date` n'est pas disponible dans la version installée, relever la façon dont les dates sont validées ailleurs (`grep -rn "vine.date\|vine.string().trim()" app/validators/`) et employer la même forme.

- [ ] **Step 2: Write the check-out use case**

```typescript
// app/features/bookings/use_cases/check_out_booking.use_case.ts
import Booking from '#models/booking'
import Client from '#models/client'
import { DomainError } from '#utils/domain_error'

import type { BookingDto } from '../dto/booking.dto.ts'
import BookingRepository from '../repositories/booking_repository.ts'

/**
 * Clôture un séjour et cumule le montant sur la fiche du client.
 *
 * Les statistiques du carnet ne sont alimentées qu'ici : les cumuler à la
 * création compterait des séjours annulés avant d'avoir commencé.
 */
export class CheckOutBookingUseCase {
  async execute(id: string, ownerId: string): Promise<BookingDto> {
    const booking = await Booking.findById(id)
    if (!booking || booking.owner_id !== ownerId) {
      throw new DomainError('booking_not_found', 'Réservation introuvable.', 404)
    }

    if (booking.status === 'completed') {
      throw new DomainError('booking_already_completed', 'Séjour déjà clôturé.', 409)
    }

    if (booking.status === 'cancelled') {
      throw new DomainError('booking_cancelled', 'Réservation annulée.', 409)
    }

    const now = new Date()
    const updated = await Booking.findOneAndUpdate(
      id,
      { status: 'completed', completed_at: now, check_out_at: now, end_date: now },
      { owner_id: ownerId }
    )

    if (!updated) {
      throw new DomainError('booking_not_found', 'Réservation introuvable.', 404)
    }

    // Seules les réservations comptoir pointent vers le carnet ; un client en
    // ligne est un `user`, dont les statistiques ne vivent pas ici.
    if (updated.source === 'offline' && updated.client_id) {
      await Client.touchStats(
        updated.client_id,
        updated.received_amount ?? updated.total_amount ?? 0,
        updated.check_in_at ?? updated.start_date
      )
    }

    return BookingRepository.toDto(updated)
  }
}

export default CheckOutBookingUseCase
```

- [ ] **Step 3: Exporter les use cases**

Ajouter à `app/features/bookings/use_cases/index.ts` :

```typescript
export { default as CreateOwnerBookingUseCase } from './create_owner_booking.use_case.ts'
export { default as CheckOutBookingUseCase } from './check_out_booking.use_case.ts'
```

- [ ] **Step 4: Étendre le contrôleur**

Remplacer les imports en tête de `app/controllers/proprio/booking_controller.ts` :

```typescript
import { createOwnerBookingValidator, listBookingsValidator } from '#validators/booking/booking'

import type { HttpContext } from '@adonisjs/core/http'

import {
  CheckOutBookingUseCase,
  CreateOwnerBookingUseCase,
  ListOwnerBookingsUseCase,
} from '../../features/bookings/use_cases/index.ts'
```

Puis ajouter les deux actions, en conservant `index` :

```typescript
  async store(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(createOwnerBookingValidator)

    const booking = await new CreateOwnerBookingUseCase().execute({
      owner_id: userId,
      property_id: payload.property_id,
      client_id: payload.client_id,
      stay_type: payload.stay_type,
      check_in_at: payload.check_in_at,
      check_out_at: payload.check_out_at,
      received_amount: payload.received_amount,
      deposit_amount: payload.deposit_amount,
      message: payload.message,
      is_check_in: payload.is_check_in ?? false,
      client_request_id: payload.client_request_id,
    })

    return ctx.response.created({ data: booking })
  }

  async checkOut(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const booking = await new CheckOutBookingUseCase().execute(ctx.params.id, userId)
    return ctx.response.ok({ data: booking })
  }
```

- [ ] **Step 5: Register the routes**

Dans `start/routes.ts`, remplacer le groupe `bookings` du bloc `proprio` :

```typescript
        router
          .group(() => {
            router.get('/', [ProprioBookingController, 'index'])
            router.post('/', [ProprioBookingController, 'store'])
            router.patch(':id/check-out', [ProprioBookingController, 'checkOut'])
          })
          .prefix('bookings')
          .as('bookings')
```

- [ ] **Step 6: Vérifier**

Run: `npm run typecheck && node ace test unit && node ace list:routes | grep bookings`
Expected: aucune erreur, tous les tests passent, trois routes `proprio.bookings.*`.

- [ ] **Step 7: Commit**

```bash
git add app/features/bookings app/validators/booking app/controllers/proprio/booking_controller.ts start/routes.ts
git commit -m "feat: routes de creation et cloture d'une reservation comptoir"
```

---

### Task 10: Brancher le prorata sur Finance

**Files:**
- Modify: `app/features/finance/repositories/finance_repository.ts`
- Test: `tests/unit/finance/finance_aggregation.spec.ts`

**Interfaces:**
- Consumes: `splitRevenueByMonth`, `daysWithinWindow` (Task 2)
- Produces: `aggregateRevenuePoints(bookings, range): RevenuePointDto[]`, exportée pour le test

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/finance/finance_aggregation.spec.ts
import { test } from '@japa/runner'
import { aggregateRevenuePoints } from '#features/finance/repositories/finance_repository'

test.group('aggregateRevenuePoints', () => {
  test('répartit un séjour à cheval entre ses deux mois', ({ assert }) => {
    const points = aggregateRevenuePoints(
      [
        {
          start_date: new Date('2026-10-28T12:00:00Z'),
          end_date: new Date('2026-11-03T12:00:00Z'),
          total_amount: 60000,
        },
      ],
      {}
    )

    assert.lengthOf(points, 2)
    assert.deepEqual(points[0], { month: 'Oct', value: 40000 })
    assert.deepEqual(points[1], { month: 'Nov', value: 20000 })
  })

  test('cumule plusieurs séjours du même mois', ({ assert }) => {
    const points = aggregateRevenuePoints(
      [
        {
          start_date: new Date('2026-10-01T12:00:00Z'),
          end_date: new Date('2026-10-03T12:00:00Z'),
          total_amount: 20000,
        },
        {
          start_date: new Date('2026-10-10T12:00:00Z'),
          end_date: new Date('2026-10-12T12:00:00Z'),
          total_amount: 30000,
        },
      ],
      {}
    )

    assert.lengthOf(points, 1)
    assert.equal(points[0].value, 50000)
  })

  test('les mois sont ordonnés du plus ancien au plus récent', ({ assert }) => {
    const points = aggregateRevenuePoints(
      [
        {
          start_date: new Date('2026-12-01T12:00:00Z'),
          end_date: new Date('2026-12-03T12:00:00Z'),
          total_amount: 10000,
        },
        {
          start_date: new Date('2026-10-01T12:00:00Z'),
          end_date: new Date('2026-10-03T12:00:00Z'),
          total_amount: 10000,
        },
      ],
      {}
    )

    assert.deepEqual(
      points.map((p) => p.month),
      ['Oct', 'Déc']
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test unit --files=finance_aggregation`
Expected: FAIL — `aggregateRevenuePoints` n'est pas exportée.

- [ ] **Step 3: Remplacer `revenuePoints` par une fonction exportée**

Dans `finance_repository.ts`, ajouter l'import :

```typescript
import { daysWithinWindow, splitRevenueByMonth } from '../revenue_split.ts'
```

Supprimer la méthode privée `revenuePoints` et ajouter, après `MONTH_LABELS` :

```typescript
/**
 * Revenu mensuel, du plus ancien au plus récent.
 *
 * Le montant d'un séjour était rattaché à son seul mois de début : un séjour
 * du 28 octobre au 3 novembre plaçait la totalité sur octobre. Il est
 * désormais réparti au prorata des jours de chaque mois traversé.
 */
export function aggregateRevenuePoints(
  bookings: Array<{ start_date: Date; end_date: Date; total_amount: number }>,
  range: { from?: Date; to?: Date }
): RevenuePointDto[] {
  const buckets = new Map<string, { month: number; year: number; value: number }>()

  for (const booking of bookings) {
    if (!booking.start_date) continue

    const end = booking.end_date ?? booking.start_date
    const slices = splitRevenueByMonth(booking.start_date, end, booking.total_amount ?? 0)

    for (const slice of slices) {
      // Une tranche hors fenêtre ne doit pas apparaître : le séjour chevauche
      // la borne, mais ces jours-là n'appartiennent pas à la période demandée.
      if (range.from && new Date(Date.UTC(slice.year, slice.month + 1, 1)) <= range.from) continue
      if (range.to && new Date(Date.UTC(slice.year, slice.month, 1)) >= range.to) continue

      const key = `${slice.year}-${slice.month}`
      const bucket = buckets.get(key) ?? { month: slice.month, year: slice.year, value: 0 }
      bucket.value += slice.amount
      buckets.set(key, bucket)
    }
  }

  return [...buckets.values()]
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .map((bucket) => ({ month: MONTH_LABELS[bucket.month] ?? '', value: bucket.value }))
}
```

- [ ] **Step 4: Corriger l'appel et le décompte des jours**

Dans `overview`, remplacer `revenue_points: this.revenuePoints(bookings)` par :

```typescript
      revenue_points: aggregateRevenuePoints(bookings, range),
```

Et remplacer le calcul de `totalDays` :

```typescript
    // Seuls les jours tombant dans la fenêtre comptent : un séjour à cheval
    // sur la borne imputait auparavant ses jours entiers à la période, d'où
    // des taux d'occupation supérieurs à 100 % plafonnés artificiellement.
    //
    // La pondération par type de séjour suit : une demi-journée n'immobilise
    // pas le bien autant qu'un séjour complet, et la compter pour un jour
    // entier gonflerait le taux.
    const totalDays = bookings.reduce(
      (sum, b) =>
        sum +
        stayTypeOccupancyDays(
          b.stay_type ?? 'full_day',
          daysWithinWindow(b.start_date, b.end_date, range.from, range.to)
        ),
      0
    )
```

Compléter l'import de `stay_type` en tête du fichier :

```typescript
import { stayTypeOccupancyDays } from '../bookings/stay_type.ts'
```

La fonction locale `stayDays` devient inutilisée : la supprimer.

- [ ] **Step 5: Ajouter le test de pondération**

Ajouter à `tests/unit/finance/finance_aggregation.spec.ts` :

```typescript
import { stayTypeOccupancyDays } from '#features/bookings/stay_type'

test.group('pondération de l’occupation', () => {
  test('une demi-journée immobilise le bien une demi-journée', ({ assert }) => {
    // Sans pondération, un enchaînement de demi-journées afficherait un taux
    // d'occupation double du réel.
    assert.equal(stayTypeOccupancyDays('half_day', 1), 0.5)
  })

  test('un séjour complet immobilise le bien un jour par jour', ({ assert }) => {
    assert.equal(stayTypeOccupancyDays('full_day', 4), 4)
  })
})
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node ace test unit && npm run typecheck`
Expected: PASS — tous les tests, aucune erreur de type.

- [ ] **Step 7: Commit**

```bash
git add app/features/finance app/features/bookings tests/unit/finance
git commit -m "fix: repartir le revenu et l'occupation au prorata des mois"
```

---

### Task 11: Route de disponibilité et vérification d'ensemble

**Files:**
- Create: `app/features/bookings/use_cases/get_availability.use_case.ts`
- Modify: `app/features/bookings/use_cases/index.ts`
- Modify: `app/controllers/proprio/property_controller.ts`
- Modify: `start/routes.ts`

**Interfaces:**
- Consumes: `Booking.findActiveForProperty` (Task 7), `ACTIVE_BOOKING_STATUSES` (Task 3), `availabilityValidator` (Task 9)
- Produces: `GET /proprio/properties/availability`

- [ ] **Step 1: Write the use case**

```typescript
// app/features/bookings/use_cases/get_availability.use_case.ts
import Booking from '#models/booking'
import Property from '#models/property'
import { DomainError } from '#utils/domain_error'

import { ACTIVE_BOOKING_STATUSES } from '../availability.ts'

export interface OccupiedPeriodDto {
  booking_id: string
  check_in_at: Date
  check_out_at: Date
  status: string
  client_name: string | null
}

/**
 * Périodes pendant lesquelles un bien est immobilisé.
 *
 * Alimente le calendrier de saisie : le propriétaire doit voir les dates déjà
 * prises avant de proposer un séjour, plutôt que d'essuyer un refus après
 * avoir tout saisi.
 */
export class GetAvailabilityUseCase {
  async execute(
    ownerId: string,
    propertyId: string,
    range: { from?: Date; to?: Date } = {}
  ): Promise<OccupiedPeriodDto[]> {
    const property = await Property.findById(propertyId)
    if (!property || property.owner_id !== ownerId) {
      throw new DomainError('property_not_found', 'Bien introuvable.', 404)
    }

    const from = range.from ?? new Date()
    const bookings = await Booking.findActiveForProperty(propertyId, from)
    const blocking = ACTIVE_BOOKING_STATUSES as readonly string[]

    return bookings
      .filter((doc) => blocking.includes(doc.status))
      .filter((doc) => !range.to || (doc.check_in_at ?? doc.start_date) < range.to)
      .map((doc) => ({
        booking_id: doc._id,
        check_in_at: doc.check_in_at ?? doc.start_date,
        check_out_at: doc.check_out_at ?? doc.end_date,
        status: doc.status,
        client_name: doc.client_snapshot?.full_name ?? null,
      }))
      .sort((a, b) => a.check_in_at.getTime() - b.check_in_at.getTime())
  }
}

export default GetAvailabilityUseCase
```

- [ ] **Step 2: Exporter le use case**

Ajouter à `app/features/bookings/use_cases/index.ts` :

```typescript
export { default as GetAvailabilityUseCase } from './get_availability.use_case.ts'
```

- [ ] **Step 3: Ajouter l'action au contrôleur des biens**

Dans `app/controllers/proprio/property_controller.ts`, ajouter la méthode :

```typescript
  async availability(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(availabilityValidator, {
      data: ctx.request.qs(),
    })

    const periods = await new GetAvailabilityUseCase().execute(userId, payload.property_id, {
      from: payload.from,
      to: payload.to,
    })

    return ctx.response.ok({ data: periods })
  }
```

Compléter les imports : `availabilityValidator` depuis `#validators/booking/booking`, et `GetAvailabilityUseCase` depuis `../../features/bookings/use_cases/index.ts`.

- [ ] **Step 4: Register the route**

Dans `start/routes.ts`, groupe `properties` du bloc `proprio`, **avant** `router.get(':id', ...)` :

```typescript
            // Avant `:id`, sinon « availability » serait pris pour un identifiant.
            router.get('availability', [ProprioPropertyController, 'availability'])
```

- [ ] **Step 5: Vérification d'ensemble**

Run: `npm run typecheck && node ace test unit && npm run lint`
Expected: aucune erreur de type, tous les tests passent, lint propre.

- [ ] **Step 6: Vérifier la liste des routes**

Run: `node ace list:routes | grep -E "clients|bookings|availability"`
Expected: cinq routes clients, trois routes bookings proprio, et `proprio.properties.availability`.

- [ ] **Step 7: Commit**

```bash
git add app/features/bookings app/controllers/proprio/property_controller.ts start/routes.ts
git commit -m "feat: consultation des periodes occupees d'un bien"
```

---

## Récapitulatif

| Tâche | Livrable | Vérification |
|---|---|---|
| 0 | Harnais de test réparé | le runner démarre |
| 1 | Types de séjour et tarifs dérivés | 10 tests |
| 2 | Prorata mensuel du revenu | 9 tests |
| 3 | Disponibilité par chevauchement | 10 tests |
| 4 | Collection `clients` | 4 tests |
| 5 | Use cases du carnet | 6 tests |
| 6 | Routes clients | `list:routes` |
| 7 | Modèle `booking` étendu | 2 tests |
| 8 | Création réservation comptoir | 6 tests |
| 9 | Routes réservation | `list:routes` |
| 10 | Finance au prorata | 3 tests |
| 11 | Disponibilité exposée | `list:routes` |

## Hors périmètre de ce plan

- **L'application Flutter** — cache SQLite, file de synchronisation, bottomsheet de sélection, écrans. Plan distinct, qui consomme les routes définies ici.
- **La résolution de conflit.** L'API renvoie `booking_period_conflict` ; l'arbitrage appartient au propriétaire, dans l'application.
- **Les tests fonctionnels HTTP.** Ils demandent un émulateur Firestore, absent du projet. Les règles de calcul, où se loge le risque, sont couvertes unitairement.
