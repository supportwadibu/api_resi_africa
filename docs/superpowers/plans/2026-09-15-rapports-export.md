# Rapports exportables — plan d'implémentation

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE : utiliser
> superpowers:subagent-driven-development (recommandé) ou
> superpowers:executing-plans pour exécuter ce plan tâche par tâche. Les étapes
> utilisent la syntaxe case à cocher (`- [ ]`) pour le suivi.

**Objectif :** Permettre à un propriétaire d'éditer un rapport PDF (bilan
financier, performance, relevé des réservations) sur une période et une
résidence, et de le recevoir via une URL signée.

**Architecture :** Une feature `app/features/reports/` qui n'accède jamais à
Firestore directement — elle appelle les use cases existants, compose du
HTML, le fait rendre en PDF par Puppeteer, puis le téléverse sur Cloudinary
en `authenticated` et renvoie une URL signée à durée limitée.

**Stack :** AdonisJS 7 · TypeScript · Luxon (déjà présent) · Puppeteer (à
ajouter) · Cloudinary (déjà présent) · Japa · Flutter/Bloc côté mobile.

**Spec :** [`docs/superpowers/specs/2026-09-15-rapports-export-design.md`](../specs/2026-09-15-rapports-export-design.md)

## Contraintes globales

- **Langue.** Commentaires, messages d'erreur utilisateur et messages de
  commit en français. Identifiants (variables, fonctions, champs JSON) en
  anglais.
- **Commentaires.** Ils disent *pourquoi*, jamais *quoi*. Un commentaire qui
  reformule la ligne suivante est du bruit.
- **Nommage.** Fichiers en `snake_case` suffixés par leur rôle
  (`generate_report.use_case.ts`). Champs JSON en `snake_case`.
- **Imports.** Par alias (`#features/*`, `#services/*`, `#validators/*`,
  `#utils/*`). Jamais de `../../..` entre couches.
- **Erreurs.** Un use case lève `DomainError(code, message, status)`. Jamais
  de `throw new Error()` brut remontant d'un use case.
- **Validation.** Toujours `ctx.request.validateUsing(...)`, jamais
  `request.body()` en direct.
- **Deux dépôts.** Commiter dans `api/` et `mobile/` séparément, jamais depuis
  la racine. Ne pousser que sur demande explicite.
- **Package Dart.** Les imports mobile utilisent `package:resi_africa/…`, le
  nom réel de `pubspec.yaml`. Le `CLAUDE.md` annonce `africa` : il est obsolète
  sur ce point, se fier au `pubspec.yaml`.
- **Fuseau de référence.** `Africa/Abidjan` (UTC+0, sans heure d'été).
- **Convention de fenêtre.** En interne, les fenêtres sont **bornées à gauche,
  ouvertes à droite** (`from` inclus, `to` exclu), comme `MonthWindow` de
  `booking_stats.ts`. L'API publique expose au contraire un `to` **inclusif**.
  La conversion se fait à la frontière, dans `report_period.ts`, et nulle part
  ailleurs.

---

## Structure des fichiers

**API — à créer :**

| Fichier | Responsabilité |
|---|---|
| `app/features/reports/report_period.ts` | Résolution des périodes, conversion inclusif → exclusif |
| `app/features/reports/dto/report.dto.ts` | Types d'entrée et de sortie |
| `app/features/reports/metrics/revpar.ts` | Calcul du RevPAR |
| `app/features/reports/metrics/payments.ts` | Encaissé par réservation, reste à percevoir |
| `app/features/reports/renderers/layout.ts` | Gabarit HTML commun, tokens CSS |
| `app/features/reports/renderers/financial_report.ts` | Bilan financier → HTML |
| `app/features/reports/renderers/performance_report.ts` | Performance → HTML |
| `app/features/reports/renderers/reservations_report.ts` | Relevé des réservations → HTML |
| `app/features/reports/use_cases/generate_report.use_case.ts` | Orchestration |
| `app/services/pdf_renderer.ts` | HTML → PDF, isole Puppeteer |
| `app/services/report_storage.ts` | PDF → Cloudinary → URL signée |
| `app/validators/report/report.ts` | Validation VineJS |
| `app/controllers/proprio/report_controller.ts` | Contrôleur |

**API — à modifier :** `start/routes.ts`, `package.json`, `.env.example`,
`config/cloudinary.ts`.

**Mobile — à modifier :** `api_endpoints.dart`, `report_type_model.dart`,
`rapport_model.dart` → `report_export_model.dart`, `rapport_repository.dart`,
`report_form_cubit.dart`, `report_form_state.dart`, `property_selector.dart`
→ `residence_selector.dart`, `rapport_screen.dart`, `service_locator.dart`.

---

## Ordre des tâches

Les tâches 1 à 3 sont des fonctions pures testables sans Firebase ni réseau —
elles constituent le socle. Les tâches 4 à 6 branchent l'infrastructure. Les
tâches 7 à 9 composent les documents. Les tâches 10 et 11 exposent la route.
Les tâches 12 à 15 portent le mobile.

---

### Tâche 1 : Résolution des périodes

**Fichiers :**
- Créer : `app/features/reports/report_period.ts`
- Test : `tests/unit/reports/report_period.spec.ts`

**Interfaces :**
- Consomme : rien (socle).
- Produit :
  - `type ReportPeriodPreset = 'this_month' | 'last_month' | 'this_year' | 'custom'`
  - `interface ReportWindow { from: Date; to: Date }` — `to` **exclu**
  - `interface ResolvedPeriod { window: ReportWindow; label: string; from_date: string; to_date: string }`
    où `from_date`/`to_date` sont les bornes **inclusives** en `YYYY-MM-DD`,
    destinées à la réponse JSON et au PDF.
  - `function resolveReportPeriod(input: { period: ReportPeriodPreset; from?: string; to?: string }, now?: Date): ResolvedPeriod`

- [ ] **Étape 1 : Écrire les tests qui échouent**

```ts
import { test } from '@japa/runner'
import { resolveReportPeriod } from '#features/reports/report_period'
import { DomainError } from '#utils/domain_error'

test.group('resolveReportPeriod', () => {
  test('this_month couvre le mois courant, fin exclue', ({ assert }) => {
    const resolved = resolveReportPeriod(
      { period: 'this_month' },
      new Date('2026-03-17T10:00:00Z')
    )

    assert.equal(resolved.window.from.toISOString(), '2026-03-01T00:00:00.000Z')
    assert.equal(resolved.window.to.toISOString(), '2026-04-01T00:00:00.000Z')
    assert.equal(resolved.from_date, '2026-03-01')
    assert.equal(resolved.to_date, '2026-03-31')
    assert.equal(resolved.label, 'Mars 2026')
  })

  test('last_month en janvier recule sur décembre de l’année précédente', ({ assert }) => {
    const resolved = resolveReportPeriod(
      { period: 'last_month' },
      new Date('2026-01-08T10:00:00Z')
    )

    assert.equal(resolved.window.from.toISOString(), '2025-12-01T00:00:00.000Z')
    assert.equal(resolved.window.to.toISOString(), '2026-01-01T00:00:00.000Z')
    assert.equal(resolved.label, 'Décembre 2025')
  })

  test('this_year couvre l’année civile', ({ assert }) => {
    const resolved = resolveReportPeriod(
      { period: 'this_year' },
      new Date('2026-07-02T10:00:00Z')
    )

    assert.equal(resolved.window.from.toISOString(), '2026-01-01T00:00:00.000Z')
    assert.equal(resolved.window.to.toISOString(), '2027-01-01T00:00:00.000Z')
    assert.equal(resolved.label, 'Année 2026')
  })

  test('custom rend le dernier jour entier : to est exclu au jour suivant', ({ assert }) => {
    const resolved = resolveReportPeriod({
      period: 'custom',
      from: '2026-03-01',
      to: '2026-03-31',
    })

    assert.equal(resolved.window.to.toISOString(), '2026-04-01T00:00:00.000Z')
    assert.equal(resolved.to_date, '2026-03-31')
  })

  test('custom sans bornes est refusé', ({ assert }) => {
    assert.throws(
      () => resolveReportPeriod({ period: 'custom' }),
      'Indiquez les dates de début et de fin de la période.'
    )
  })

  test('custom avec from postérieur à to est refusé', ({ assert }) => {
    assert.throws(() =>
      resolveReportPeriod({ period: 'custom', from: '2026-04-01', to: '2026-03-01' })
    )
  })

  test('une plage au-delà de 24 mois est refusée', ({ assert }) => {
    try {
      resolveReportPeriod({ period: 'custom', from: '2020-01-01', to: '2026-01-01' })
      assert.fail('aurait dû lever')
    } catch (error) {
      assert.instanceOf(error, DomainError)
      assert.equal((error as DomainError).code, 'report_period_too_large')
    }
  })

  test('une date mal formée est refusée', ({ assert }) => {
    try {
      resolveReportPeriod({ period: 'custom', from: '01/03/2026', to: '2026-03-31' })
      assert.fail('aurait dû lever')
    } catch (error) {
      assert.equal((error as DomainError).code, 'invalid_report_period')
    }
  })
})
```

- [ ] **Étape 2 : Lancer les tests et vérifier qu'ils échouent**

Commande : `npm run test -- --files="tests/unit/reports/report_period.spec.ts"`
Attendu : ÉCHEC, module introuvable.

- [ ] **Étape 3 : Implémenter**

```ts
import { DateTime } from 'luxon'
import { DomainError } from '#utils/domain_error'

/**
 * Fuseau de référence du produit. La Côte d'Ivoire est à UTC+0 et ne pratique
 * pas l'heure d'été : les bornes d'un mois y coïncident avec celles d'UTC.
 * Le fuseau reste nommé explicitement pour que l'intention survive à un
 * déploiement sur un serveur réglé ailleurs.
 */
const REPORT_TIMEZONE = 'Africa/Abidjan'

/**
 * Plafond de la plage demandée.
 *
 * Un relevé de réservations sur cinq ans produirait un document de plusieurs
 * centaines de pages et ferait expirer le timeout de rendu. Le refus explicite
 * vaut mieux qu'une requête qui s'interrompt sans message exploitable.
 */
const MAX_PERIOD_MONTHS = 24

export type ReportPeriodPreset = 'this_month' | 'last_month' | 'this_year' | 'custom'

/** Fenêtre bornée à gauche, ouverte à droite — `from` inclus, `to` exclu. */
export interface ReportWindow {
  from: Date
  to: Date
}

export interface ResolvedPeriod {
  window: ReportWindow
  /** Libellé affichable : « Mars 2026 », « Année 2026 », « 01/03 – 15/04/2026 ». */
  label: string
  /** Borne de début, inclusive, en `YYYY-MM-DD`. */
  from_date: string
  /** Borne de fin, **inclusive**, en `YYYY-MM-DD`. */
  to_date: string
}

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

function parseDay(value: string): DateTime {
  const parsed = DateTime.fromFormat(value, 'yyyy-MM-dd', { zone: REPORT_TIMEZONE })

  if (!parsed.isValid) {
    throw new DomainError(
      'invalid_report_period',
      'Les dates doivent être au format AAAA-MM-JJ.',
      422
    )
  }

  return parsed.startOf('day')
}

/**
 * Convertit une fenêtre Luxon en bornes exposables.
 *
 * `to` arrive **exclu** — convention interne partagée avec `MonthWindow` de
 * `booking_stats.ts` — et ressort **inclus** dans `to_date`, parce qu'un
 * utilisateur lit « du 1er au 31 mars », jamais « jusqu'au 1er avril exclu ».
 * C'est le seul endroit du code où les deux conventions se rencontrent.
 */
function toResolved(from: DateTime, toExclusive: DateTime, label: string): ResolvedPeriod {
  return {
    window: { from: from.toJSDate(), to: toExclusive.toJSDate() },
    label,
    from_date: from.toFormat('yyyy-MM-dd'),
    to_date: toExclusive.minus({ days: 1 }).toFormat('yyyy-MM-dd'),
  }
}

export function resolveReportPeriod(
  input: { period: ReportPeriodPreset; from?: string; to?: string },
  now: Date = new Date()
): ResolvedPeriod {
  const reference = DateTime.fromJSDate(now, { zone: REPORT_TIMEZONE })

  if (input.period === 'this_month') {
    const start = reference.startOf('month')
    return toResolved(
      start,
      start.plus({ months: 1 }),
      `${MONTH_NAMES[start.month - 1]} ${start.year}`
    )
  }

  if (input.period === 'last_month') {
    const start = reference.startOf('month').minus({ months: 1 })
    return toResolved(
      start,
      start.plus({ months: 1 }),
      `${MONTH_NAMES[start.month - 1]} ${start.year}`
    )
  }

  if (input.period === 'this_year') {
    const start = reference.startOf('year')
    return toResolved(start, start.plus({ years: 1 }), `Année ${start.year}`)
  }

  if (!input.from || !input.to) {
    throw new DomainError(
      'invalid_report_period',
      'Indiquez les dates de début et de fin de la période.',
      422
    )
  }

  const from = parseDay(input.from)
  const toInclusive = parseDay(input.to)

  if (toInclusive < from) {
    throw new DomainError(
      'invalid_report_period',
      'La date de fin doit suivre la date de début.',
      422
    )
  }

  // Le jour de fin est inclus : la fenêtre s'arrête au début du lendemain,
  // sinon un séjour du dernier jour sortirait du relevé.
  const toExclusive = toInclusive.plus({ days: 1 })

  if (toExclusive.diff(from, 'months').months > MAX_PERIOD_MONTHS) {
    throw new DomainError(
      'report_period_too_large',
      'La période ne peut pas dépasser 24 mois.',
      422
    )
  }

  return toResolved(
    from,
    toExclusive,
    `${from.toFormat('dd/MM/yyyy')} – ${toInclusive.toFormat('dd/MM/yyyy')}`
  )
}
```

- [ ] **Étape 4 : Lancer les tests et vérifier qu'ils passent**

Commande : `npm run test -- --files="tests/unit/reports/report_period.spec.ts"`
Attendu : SUCCÈS, 8 tests.

- [ ] **Étape 5 : Commiter**

```bash
git add app/features/reports/report_period.ts tests/unit/reports/report_period.spec.ts
git commit -m "feat(reports): resolution des periodes de rapport"
```

---

### Tâche 2 : Calcul du RevPAR

**Fichiers :**
- Créer : `app/features/reports/metrics/revpar.ts`
- Test : `tests/unit/reports/revpar.spec.ts`

**Interfaces :**
- Consomme : rien.
- Produit : `function computeRevpar(grossRevenue: number, availableDays: number): number`

- [ ] **Étape 1 : Écrire les tests qui échouent**

```ts
import { test } from '@japa/runner'
import { computeRevpar } from '#features/reports/metrics/revpar'

test.group('computeRevpar', () => {
  test('rapporte le revenu aux jours disponibles', ({ assert }) => {
    assert.equal(computeRevpar(300000, 30), 10000)
  })

  test('rend 0 quand aucun jour n’est disponible', ({ assert }) => {
    assert.equal(computeRevpar(300000, 0), 0)
  })

  test('rend 0 sur un nombre de jours négatif', ({ assert }) => {
    assert.equal(computeRevpar(300000, -5), 0)
  })

  test('arrondit à l’unité : le franc CFA n’a pas de centime', ({ assert }) => {
    assert.equal(computeRevpar(100000, 3), 33333)
  })
})
```

- [ ] **Étape 2 : Lancer les tests et vérifier qu'ils échouent**

Commande : `npm run test -- --files="tests/unit/reports/revpar.spec.ts"`
Attendu : ÉCHEC, module introuvable.

- [ ] **Étape 3 : Implémenter**

```ts
/**
 * Revenu moyen par jour disponible.
 *
 * Distinct du prix moyen pratiqué : le RevPAR rapporte le revenu à **tous**
 * les jours du parc, occupés ou non. Un bien loué cher mais vide la moitié du
 * temps y apparaît pour ce qu'il rapporte réellement.
 *
 * Le zéro sur un dénominateur nul n'est pas un repli défensif mais la seule
 * réponse lisible : un parc sans jour disponible ne rapporte rien par jour, et
 * `Infinity` traverserait le PDF jusqu'à s'afficher tel quel.
 */
export function computeRevpar(grossRevenue: number, availableDays: number): number {
  if (availableDays <= 0) return 0

  return Math.round(grossRevenue / availableDays)
}
```

- [ ] **Étape 4 : Lancer les tests et vérifier qu'ils passent**

Commande : `npm run test -- --files="tests/unit/reports/revpar.spec.ts"`
Attendu : SUCCÈS, 4 tests.

- [ ] **Étape 5 : Commiter**

```bash
git add app/features/reports/metrics/revpar.ts tests/unit/reports/revpar.spec.ts
git commit -m "feat(reports): calcul du revpar"
```

---

### Tâche 3 : Encaissements et reste à percevoir

**Fichiers :**
- Créer : `app/features/reports/metrics/payments.ts`
- Test : `tests/unit/reports/payments.spec.ts`

**Interfaces :**
- Consomme : rien.
- Produit :
  - `interface SettlementPayment { booking_id: string; amount: number; status: string }`
  - `interface BookingSettlement { booking_id: string; total_amount: number; settled_amount: number; outstanding_amount: number; is_settled: boolean }`
  - `function sumSettledPayments(payments: readonly SettlementPayment[], bookingId: string): number`
  - `function buildSettlement(booking: { id: string; total_amount: number }, payments: readonly SettlementPayment[]): BookingSettlement`

**Attention — piège documenté dans la spec :** `received_amount` d'une
réservation n'est **pas** l'argent encaissé mais le montant négocié. Il ne doit
apparaître nulle part dans ce fichier.

- [ ] **Étape 1 : Écrire les tests qui échouent**

```ts
import { test } from '@japa/runner'
import { buildSettlement, sumSettledPayments } from '#features/reports/metrics/payments'

const payments = [
  { booking_id: 'b1', amount: 50000, status: 'success' },
  { booking_id: 'b1', amount: 30000, status: 'success' },
  { booking_id: 'b1', amount: 20000, status: 'pending' },
  { booking_id: 'b1', amount: 90000, status: 'failed' },
  { booking_id: 'b2', amount: 70000, status: 'success' },
]

test.group('sumSettledPayments', () => {
  test('ne somme que les paiements aboutis de la réservation', ({ assert }) => {
    assert.equal(sumSettledPayments(payments, 'b1'), 80000)
  })

  test('ignore les paiements des autres réservations', ({ assert }) => {
    assert.equal(sumSettledPayments(payments, 'b2'), 70000)
  })

  test('rend 0 quand la réservation n’a aucun paiement', ({ assert }) => {
    assert.equal(sumSettledPayments(payments, 'inconnu'), 0)
  })
})

test.group('buildSettlement', () => {
  test('calcule le reste à percevoir', ({ assert }) => {
    const settlement = buildSettlement({ id: 'b1', total_amount: 100000 }, payments)

    assert.equal(settlement.settled_amount, 80000)
    assert.equal(settlement.outstanding_amount, 20000)
    assert.isFalse(settlement.is_settled)
  })

  test('marque soldée une réservation entièrement payée', ({ assert }) => {
    const settlement = buildSettlement({ id: 'b2', total_amount: 70000 }, payments)

    assert.equal(settlement.outstanding_amount, 0)
    assert.isTrue(settlement.is_settled)
  })

  test('un trop-perçu ne produit pas un reste négatif', ({ assert }) => {
    const settlement = buildSettlement({ id: 'b2', total_amount: 50000 }, payments)

    assert.equal(settlement.outstanding_amount, 0)
    assert.isTrue(settlement.is_settled)
  })

  test('une réservation comptoir sans paiement enregistré reste due', ({ assert }) => {
    const settlement = buildSettlement({ id: 'comptoir', total_amount: 40000 }, payments)

    assert.equal(settlement.settled_amount, 0)
    assert.equal(settlement.outstanding_amount, 40000)
  })
})
```

- [ ] **Étape 2 : Lancer les tests et vérifier qu'ils échouent**

Commande : `npm run test -- --files="tests/unit/reports/payments.spec.ts"`
Attendu : ÉCHEC, module introuvable.

- [ ] **Étape 3 : Implémenter**

```ts
/**
 * Encaissements d'une réservation.
 *
 * L'argent reçu se lit **exclusivement** sur les `booking_payments` de statut
 * `success`. Le champ `received_amount` de la réservation porte, malgré son
 * nom, le montant *négocié* — il alimente `total_amount`, et le prendre pour
 * l'encaissé afficherait toute réservation comme soldée.
 */

/** Paiement réduit à ce dont le calcul a besoin. */
export interface SettlementPayment {
  booking_id: string
  amount: number
  status: string
}

export interface BookingSettlement {
  booking_id: string
  total_amount: number
  settled_amount: number
  outstanding_amount: number
  is_settled: boolean
}

/**
 * Seul `success` vaut encaissement : `pending`, `failed`, `expired` et
 * `cancelled` sont des tentatives, et les sommer gonflerait le total de
 * paiements qui n'ont jamais eu lieu.
 */
const SETTLED_STATUS = 'success'

export function sumSettledPayments(
  payments: readonly SettlementPayment[],
  bookingId: string
): number {
  return payments
    .filter((payment) => payment.booking_id === bookingId && payment.status === SETTLED_STATUS)
    .reduce((total, payment) => total + payment.amount, 0)
}

export function buildSettlement(
  booking: { id: string; total_amount: number },
  payments: readonly SettlementPayment[]
): BookingSettlement {
  const settled = sumSettledPayments(payments, booking.id)

  // Un trop-perçu — arrhes conservées, réservation raccourcie — ne doit pas
  // produire un reste négatif qui se soustrairait du total du rapport.
  const outstanding = Math.max(0, booking.total_amount - settled)

  return {
    booking_id: booking.id,
    total_amount: booking.total_amount,
    settled_amount: settled,
    outstanding_amount: outstanding,
    is_settled: outstanding === 0,
  }
}
```

- [ ] **Étape 4 : Lancer les tests et vérifier qu'ils passent**

Commande : `npm run test -- --files="tests/unit/reports/payments.spec.ts"`
Attendu : SUCCÈS, 7 tests.

- [ ] **Étape 5 : Commiter**

```bash
git add app/features/reports/metrics/payments.ts tests/unit/reports/payments.spec.ts
git commit -m "feat(reports): encaissements et reste a percevoir"
```

---

### Tâche 4 : DTO des rapports

**Fichiers :**
- Créer : `app/features/reports/dto/report.dto.ts`

**Interfaces :**
- Consomme : `ReportPeriodPreset`, `ResolvedPeriod` (tâche 1).
- Produit : `ReportType`, `GenerateReportInput`, `GeneratedReportDto`,
  `ReportContext`.

Pas de test : ce fichier ne contient que des types, effacés à la compilation.
`npm run typecheck` en tient lieu.

- [ ] **Étape 1 : Écrire le fichier**

```ts
import type { ReportPeriodPreset, ResolvedPeriod } from '../report_period.ts'

/**
 * Les trois rapports adossés à des données existantes.
 *
 * `maintenance` et `fiscal` figuraient dans la maquette mobile : le premier
 * suppose une notion d'intervention et de prestataire, le second un marqueur
 * de déductibilité sur les dépenses. Ni l'une ni l'autre n'existe, et les
 * produire donnerait un document qui promet plus qu'il ne montre.
 */
export type ReportType = 'financial' | 'performance' | 'reservations'

export interface GenerateReportInput {
  type: ReportType
  period: ReportPeriodPreset
  from?: string
  to?: string
  /** Absent : toutes les résidences du propriétaire. */
  residence_id?: string
}

/**
 * Tout ce que les renderers ont besoin de savoir sur l'en-tête du document,
 * indépendamment du type de rapport.
 */
export interface ReportContext {
  owner_name: string
  /** Nom de la résidence, ou `null` pour l'ensemble du parc. */
  residence_name: string | null
  period: ResolvedPeriod
  /** Instant d'édition, imprimé en page de garde. */
  generated_at: Date
}

export interface GeneratedReportDto {
  url: string
  expires_at: Date
  filename: string
  period: {
    from: string
    to: string
  }
}
```

- [ ] **Étape 2 : Vérifier la compilation**

Commande : `npm run typecheck`
Attendu : SUCCÈS, aucune erreur.

- [ ] **Étape 3 : Commiter**

```bash
git add app/features/reports/dto/report.dto.ts
git commit -m "feat(reports): dto des rapports"
```

---

### Tâche 5 : Service de rendu PDF

**Fichiers :**
- Créer : `app/services/pdf_renderer.ts`
- Modifier : `package.json` (ajout de `puppeteer`)

**Interfaces :**
- Consomme : rien.
- Produit : `function renderPdf(html: string): Promise<Buffer>`,
  `function closePdfRenderer(): Promise<void>`

Pas de test unitaire : ce service lance un navigateur, ce qui sort du cadre
de `tests/unit/` (fonctions pures, sans service externe). Il est couvert
indirectement par la tâche 11.

- [ ] **Étape 1 : Installer Puppeteer**

```bash
npm install puppeteer
```

- [ ] **Étape 2 : Écrire le service**

```ts
import puppeteer, { type Browser } from 'puppeteer'

/**
 * Rendu d'un document HTML en PDF.
 *
 * L'implémentation est confinée ici, comme `document_storage` confine
 * Cloudinary : les renderers composent du HTML et ignorent tout du moteur.
 * Remplacer Puppeteer ne toucherait que ce fichier.
 */

/**
 * Le navigateur est démarré une fois et réutilisé.
 *
 * Un lancement coûte environ 300 ms ; le payer à chaque rapport alourdirait
 * sensiblement le temps de réponse perçu. L'instance est partagée, chaque
 * rendu ouvrant son propre onglet.
 */
let browser: Browser | null = null

/**
 * Au-delà, le rendu est abandonné. Sans cette borne, une page qui ne se
 * stabilise jamais retiendrait un onglet et sa mémoire indéfiniment.
 */
const RENDER_TIMEOUT_MS = 30_000

async function getBrowser(): Promise<Browser> {
  if (browser?.connected) return browser

  browser = await puppeteer.launch({
    headless: true,
    // Requis en conteneur : sans `--no-sandbox`, Chromium refuse de démarrer
    // sous un utilisateur non privilégié sans namespaces.
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })

  return browser
}

export async function renderPdf(html: string): Promise<Buffer> {
  const page = await (await getBrowser()).newPage()

  try {
    // `domcontentloaded` et non `networkidle0` : le document n'a aucune
    // ressource externe — polices et styles sont inlinés — et attendre le
    // silence réseau ajouterait une demi-seconde à chaque rapport.
    await page.setContent(html, {
      waitUntil: 'domcontentloaded',
      timeout: RENDER_TIMEOUT_MS,
    })

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      timeout: RENDER_TIMEOUT_MS,
      // Les marges sont portées par `@page` dans le CSS du gabarit, qui sait
      // aussi placer en-têtes et pieds. Les fixer ici les dédoublerait.
      preferCSSPageSize: true,
    })

    return Buffer.from(pdf)
  } finally {
    // L'onglet est fermé même en cas d'échec : un rendu interrompu qui laisse
    // sa page ouverte fait fuir la mémoire du navigateur partagé.
    await page.close()
  }
}

/** Fermeture propre, appelée à l'arrêt du serveur. */
export async function closePdfRenderer(): Promise<void> {
  await browser?.close()
  browser = null
}
```

- [ ] **Étape 3 : Vérifier la compilation**

Commande : `npm run typecheck`
Attendu : SUCCÈS.

- [ ] **Étape 4 : Commiter**

```bash
git add package.json package-lock.json app/services/pdf_renderer.ts
git commit -m "feat(reports): service de rendu pdf"
```

---

### Tâche 6 : Stockage des rapports

**Fichiers :**
- Créer : `app/services/report_storage.ts`
- Modifier : `config/cloudinary.ts` (ajout de `reportsFolder`), `.env.example`

**Interfaces :**
- Consomme : rien.
- Produit :
  - `interface StoredReport { url: string; expires_at: Date; public_id: string }`
  - `function uploadReport(pdf: Buffer, filename: string): Promise<StoredReport>`

- [ ] **Étape 1 : Lire le service existant**

Lire `app/services/document_storage.ts` en entier. Le nouveau service en
reprend la structure : configuration paresseuse du SDK, envoi en
`authenticated`, URL signée à durée limitée.

- [ ] **Étape 2 : Ajouter le dossier de destination à la configuration**

Dans `config/cloudinary.ts`, ajouter à côté de `documentsFolder` :

```ts
  /** Dossier des rapports PDF. Séparé des justificatifs : rétentions distinctes. */
  reportsFolder: env.get('CLOUDINARY_REPORTS_FOLDER', 'resi/reports'),
```

Et documenter la variable dans `.env.example` :

```
CLOUDINARY_REPORTS_FOLDER=resi/reports
```

- [ ] **Étape 3 : Écrire le service**

```ts
import cloudinaryConfig from '#config/cloudinary'
import { v2 as cloudinary } from 'cloudinary'

/**
 * Stockage des rapports PDF édités par les propriétaires.
 *
 * Les rapports sont **privés** : ils portent le chiffre d'affaires d'un
 * propriétaire et les coordonnées de ses clients. Comme les pièces d'identité
 * de `document_storage`, ils partent en `authenticated` et ne sont lisibles
 * que par une URL signée à durée limitée.
 */

/**
 * Durée de validité du lien. Assez pour ouvrir le document ou le partager
 * dans la foulée, trop peu pour qu'il circule durablement.
 */
const SIGNED_URL_TTL_MS = 15 * 60 * 1000

let configured = false

function client() {
  if (!configured) {
    const { cloudName, apiKey, apiSecret } = cloudinaryConfig

    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error(
        'Cloudinary n’est pas configuré : renseignez CLOUDINARY_CLOUD_NAME, ' +
          'CLOUDINARY_API_KEY et CLOUDINARY_API_SECRET.'
      )
    }

    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true })
    configured = true
  }

  return cloudinary
}

export interface StoredReport {
  url: string
  expires_at: Date
  public_id: string
}

export async function uploadReport(pdf: Buffer, filename: string): Promise<StoredReport> {
  const publicId = `${cloudinaryConfig.reportsFolder}/${filename}`

  const uploaded = await new Promise<{ public_id: string }>((resolve, reject) => {
    const stream = client().uploader.upload_stream(
      {
        public_id: publicId,
        type: 'authenticated',
        // `raw` et non `image` : un PDF passé en `image` serait converti en
        // aperçu par Cloudinary, et le document téléchargé ne serait plus
        // celui qu'on a produit.
        resource_type: 'raw',
        overwrite: true,
      },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Envoi du rapport échoué.'))
        resolve(result)
      }
    )

    stream.end(pdf)
  })

  const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_MS)

  const url = client().url(uploaded.public_id, {
    type: 'authenticated',
    resource_type: 'raw',
    sign_url: true,
    secure: true,
    expires_at: Math.floor(expiresAt.getTime() / 1000),
  })

  return { url, expires_at: expiresAt, public_id: uploaded.public_id }
}
```

- [ ] **Étape 4 : Vérifier la compilation**

Commande : `npm run typecheck`
Attendu : SUCCÈS.

- [ ] **Étape 5 : Commiter**

```bash
git add app/services/report_storage.ts config/cloudinary.ts .env.example
git commit -m "feat(reports): stockage des rapports en url signee"
```

---

### Tâche 7 : Gabarit HTML commun

**Fichiers :**
- Créer : `app/features/reports/renderers/layout.ts`
- Test : `tests/unit/reports/layout.spec.ts`

**Interfaces :**
- Consomme : `ReportContext` (tâche 4).
- Produit :
  - `function escapeHtml(value: string): string`
  - `function formatAmount(value: number): string`
  - `function formatPercent(ratio: number): string`
  - `function renderDocument(input: { title: string; context: ReportContext; sections: string[] }): string`

- [ ] **Étape 1 : Écrire les tests qui échouent**

```ts
import { test } from '@japa/runner'
import { escapeHtml, formatAmount, formatPercent, renderDocument } from '#features/reports/renderers/layout'

const context = {
  owner_name: 'Kouassi & Fils',
  residence_name: 'Résidence Les Cocotiers',
  period: {
    window: { from: new Date('2026-03-01T00:00:00Z'), to: new Date('2026-04-01T00:00:00Z') },
    label: 'Mars 2026',
    from_date: '2026-03-01',
    to_date: '2026-03-31',
  },
  generated_at: new Date('2026-04-02T09:30:00Z'),
}

test.group('escapeHtml', () => {
  test('neutralise les chevrons d’un nom de client', ({ assert }) => {
    assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  test('neutralise les esperluettes et les guillemets', ({ assert }) => {
    assert.equal(escapeHtml('Kouassi & "Fils"'), 'Kouassi &amp; &quot;Fils&quot;')
  })
})

test.group('formatAmount', () => {
  test('sépare les milliers et suffixe la devise', ({ assert }) => {
    assert.match(formatAmount(1250000), /1\s?250\s?000\sFCFA/)
  })

  test('affiche un montant négatif', ({ assert }) => {
    assert.include(formatAmount(-50000), '-')
  })
})

test.group('formatPercent', () => {
  test('rend un ratio en pourcentage entier', ({ assert }) => {
    assert.equal(formatPercent(0.734), '73 %')
  })

  test('rend 0 % sur un ratio nul', ({ assert }) => {
    assert.equal(formatPercent(0), '0 %')
  })
})

test.group('renderDocument', () => {
  test('porte le titre, le propriétaire et la période en page de garde', ({ assert }) => {
    const html = renderDocument({ title: 'Bilan financier', context, sections: [] })

    assert.include(html, 'Bilan financier')
    assert.include(html, 'Kouassi &amp; Fils')
    assert.include(html, 'Résidence Les Cocotiers')
    assert.include(html, 'Mars 2026')
  })

  test('annonce tout le parc quand aucune résidence n’est filtrée', ({ assert }) => {
    const html = renderDocument({
      title: 'Bilan financier',
      context: { ...context, residence_name: null },
      sections: [],
    })

    assert.include(html, 'Toutes mes résidences')
  })

  test('répète la période en pied de page', ({ assert }) => {
    const html = renderDocument({ title: 'Bilan financier', context, sections: [] })

    assert.include(html, '@page')
    assert.include(html, 'position: running(footer)')
  })

  test('assemble les sections dans l’ordre reçu', ({ assert }) => {
    const html = renderDocument({
      title: 'T',
      context,
      sections: ['<section>Première</section>', '<section>Seconde</section>'],
    })

    assert.isBelow(html.indexOf('Première'), html.indexOf('Seconde'))
  })
})
```

- [ ] **Étape 2 : Lancer les tests et vérifier qu'ils échouent**

Commande : `npm run test -- --files="tests/unit/reports/layout.spec.ts"`
Attendu : ÉCHEC, module introuvable.

- [ ] **Étape 3 : Implémenter**

Écrire `layout.ts` avec :

1. `escapeHtml` — échappe `&`, `<`, `>`, `"`, `'`. Commentaire expliquant que
   les noms de clients viennent d'une saisie libre et atterrissent dans le
   document.
2. `formatAmount` — `Intl.NumberFormat('fr-FR')` + suffixe `FCFA`, sans
   décimale (le franc CFA n'a pas de centime).
3. `formatPercent` — ratio 0–1 vers pourcentage entier, suffixe ` %` avec
   espace insécable.
4. `renderDocument` — assemble `<!doctype html>`, un `<style>` inline
   contenant :
   - les tokens CSS repris de `app_colors.dart` et `app_text_styles.dart` ;
   - `@page { size: A4; margin: 18mm 16mm 22mm; }` ;
   - un pied de page en `position: running(footer)` portant
     « RESI · <résidence> · <période> » et `counter(page)` / `counter(pages)` ;
   - `.cover` en pleine page avec `page-break-after: always` ;
   - `table { page-break-inside: auto }`, `tr { page-break-inside: avoid }`,
     `thead { display: table-header-group }` pour que l'en-tête se répète.
   - Aucune balise `<link>` ni `@import` : les polices système suffisent, et
     une police distante échouerait silencieusement en rendant un document
     dans une fonte inattendue.

Le nom de la résidence tombe sur « Toutes mes résidences » quand
`residence_name` est `null`.

- [ ] **Étape 4 : Lancer les tests et vérifier qu'ils passent**

Commande : `npm run test -- --files="tests/unit/reports/layout.spec.ts"`
Attendu : SUCCÈS, 10 tests.

- [ ] **Étape 5 : Commiter**

```bash
git add app/features/reports/renderers/layout.ts tests/unit/reports/layout.spec.ts
git commit -m "feat(reports): gabarit html commun des rapports"
```

---

### Tâche 8 : Renderer du bilan financier

**Fichiers :**
- Créer : `app/features/reports/renderers/financial_report.ts`
- Test : `tests/unit/reports/financial_report.spec.ts`

**Interfaces :**
- Consomme : `renderDocument`, `formatAmount`, `formatPercent`, `escapeHtml`
  (tâche 7) ; `ReportContext` (tâche 4) ; `FinanceOverviewDto` de
  `#features/finance/dto/finance.dto`.
- Produit :
  - `interface FinancialReportData { overview: FinanceOverviewDto; expenses_by_category: Array<{ category: string; amount: number }> }`
  - `function renderFinancialReport(data: FinancialReportData, context: ReportContext): string`

- [ ] **Étape 1 : Écrire les tests qui échouent**

```ts
import { test } from '@japa/runner'
import { renderFinancialReport } from '#features/reports/renderers/financial_report'

const context = {
  owner_name: 'Kouassi',
  residence_name: null,
  period: {
    window: { from: new Date('2026-03-01T00:00:00Z'), to: new Date('2026-04-01T00:00:00Z') },
    label: 'Mars 2026',
    from_date: '2026-03-01',
    to_date: '2026-03-31',
  },
  generated_at: new Date('2026-04-02T09:30:00Z'),
}

const data = {
  overview: {
    summary: {
      ca_brut: 1250000,
      depenses: 300000,
      benefice_net: 950000,
      taux_occupation: 0.73,
      reservations: 12,
      moyen_sejour: 4.5,
    },
    revenue_points: [
      { month: 'Jan', value: 400000 },
      { month: 'Fév', value: 850000 },
    ],
  },
  expenses_by_category: [
    { category: 'electricity', amount: 180000 },
    { category: 'cleaning', amount: 120000 },
  ],
}

test.group('renderFinancialReport', () => {
  test('affiche les six chiffres clés', ({ assert }) => {
    const html = renderFinancialReport(data, context)

    assert.match(html, /1\s?250\s?000/)
    assert.match(html, /950\s?000/)
    assert.include(html, '73 %')
    assert.include(html, '12')
  })

  test('traduit les catégories de dépense en français', ({ assert }) => {
    const html = renderFinancialReport(data, context)

    assert.include(html, 'Électricité')
    assert.include(html, 'Ménage')
    assert.notInclude(html, 'electricity')
  })

  test('calcule la part de chaque catégorie', ({ assert }) => {
    const html = renderFinancialReport(data, context)

    assert.include(html, '60 %')
  })

  test('trace une courbe des revenus', ({ assert }) => {
    const html = renderFinancialReport(data, context)

    assert.include(html, '<svg')
    assert.include(html, 'Fév')
  })

  test('porte la note sur la non-répartition des charges communes', ({ assert }) => {
    const html = renderFinancialReport(data, context)

    assert.include(html, 'charges communes')
  })

  test('reste valide sur une période sans activité', ({ assert }) => {
    const html = renderFinancialReport(
      {
        overview: {
          summary: {
            ca_brut: 0, depenses: 0, benefice_net: 0,
            taux_occupation: 0, reservations: 0, moyen_sejour: 0,
          },
          revenue_points: [],
        },
        expenses_by_category: [],
      },
      context
    )

    assert.include(html, 'Aucun mouvement sur la période')
  })

  test('affiche un bénéfice négatif sans le masquer', ({ assert }) => {
    const html = renderFinancialReport(
      {
        overview: {
          summary: {
            ca_brut: 100000, depenses: 250000, benefice_net: -150000,
            taux_occupation: 0.2, reservations: 2, moyen_sejour: 3,
          },
          revenue_points: [],
        },
        expenses_by_category: [],
      },
      context
    )

    assert.match(html, /-\s?150\s?000/)
  })
})
```

- [ ] **Étape 2 : Lancer les tests et vérifier qu'ils échouent**

Commande : `npm run test -- --files="tests/unit/reports/financial_report.spec.ts"`
Attendu : ÉCHEC, module introuvable.

- [ ] **Étape 3 : Implémenter**

Écrire `financial_report.ts` :

1. Une table `CATEGORY_LABELS` traduisant les huit valeurs de
   `EXPENSE_CATEGORIES` (`electricity` → « Électricité », `water` → « Eau »,
   `internet` → « Internet », `tv` → « Télévision », `cleaning` → « Ménage »,
   `maintenance` → « Entretien », `taxes` → « Taxes », `other` → « Autre »).
   Un repli sur « Autre » pour une catégorie inconnue, avec un commentaire :
   une dépense écrite avant l'ajout d'une catégorie ne doit pas produire une
   cellule vide.
2. Une section « Chiffres clés » : les six champs de `FinanceSummaryDto`, en
   cartes.
3. Une courbe SVG des `revenue_points` : une `polyline` sur un `viewBox`
   normalisé, avec les libellés de mois en abscisse. Le maximum sert d'échelle ;
   quand il vaut 0, la courbe est plate plutôt que divisée par zéro.
4. Un tableau des dépenses par catégorie avec la part du total, arrondie à
   l'entier.
5. Une section « Note de méthode » rappelant le mode de calcul du bénéfice et
   la non-répartition des charges communes de résidence sur les unités, avec
   renvoi à `docs/specs/residences-design.md`.
6. Quand `ca_brut`, `depenses` et `reservations` valent tous 0, afficher
   « Aucun mouvement sur la période » à la place des sections 3 et 4.

Toute valeur issue d'une saisie passe par `escapeHtml`.

- [ ] **Étape 4 : Lancer les tests et vérifier qu'ils passent**

Commande : `npm run test -- --files="tests/unit/reports/financial_report.spec.ts"`
Attendu : SUCCÈS, 7 tests.

- [ ] **Étape 5 : Commiter**

```bash
git add app/features/reports/renderers/financial_report.ts tests/unit/reports/financial_report.spec.ts
git commit -m "feat(reports): renderer du bilan financier"
```

---

### Tâche 9 : Renderer de la performance

**Fichiers :**
- Créer : `app/features/reports/renderers/performance_report.ts`
- Test : `tests/unit/reports/performance_report.spec.ts`

**Interfaces :**
- Consomme : gabarit (tâche 7), `computeRevpar` (tâche 2), `ReportContext`.
- Produit :
  - `interface PerformancePropertyRow { property_title: string; occupied_days: number; available_days: number; gross_revenue: number }`
  - `interface PerformanceReportData { occupied_days: number; available_days: number; average_stay: number; gross_revenue: number; monthly_occupancy: Array<{ month: string; ratio: number }>; properties: PerformancePropertyRow[] }`
  - `function renderPerformanceReport(data: PerformanceReportData, context: ReportContext): string`

- [ ] **Étape 1 : Écrire les tests qui échouent**

```ts
import { test } from '@japa/runner'
import { renderPerformanceReport } from '#features/reports/renderers/performance_report'

const context = {
  owner_name: 'Kouassi',
  residence_name: 'Les Cocotiers',
  period: {
    window: { from: new Date('2026-03-01T00:00:00Z'), to: new Date('2026-04-01T00:00:00Z') },
    label: 'Mars 2026',
    from_date: '2026-03-01',
    to_date: '2026-03-31',
  },
  generated_at: new Date('2026-04-02T09:30:00Z'),
}

const data = {
  occupied_days: 22,
  available_days: 31,
  average_stay: 4.5,
  gross_revenue: 620000,
  monthly_occupancy: [{ month: 'Mars', ratio: 0.71 }],
  properties: [
    { property_title: 'Studio A', occupied_days: 15, available_days: 31, gross_revenue: 400000 },
    { property_title: 'Studio B', occupied_days: 7, available_days: 31, gross_revenue: 220000 },
  ],
}

test.group('renderPerformanceReport', () => {
  test('affiche le RevPAR calculé sur les jours disponibles', ({ assert }) => {
    const html = renderPerformanceReport(data, context)

    // 620000 / 31 = 20000
    assert.match(html, /20\s?000/)
  })

  test('affiche les jours occupés sur les jours disponibles', ({ assert }) => {
    const html = renderPerformanceReport(data, context)

    assert.include(html, '22')
    assert.include(html, '31')
  })

  test('classe les biens par occupation décroissante', ({ assert }) => {
    const html = renderPerformanceReport(data, context)

    assert.isBelow(html.indexOf('Studio A'), html.indexOf('Studio B'))
  })

  test('trace un histogramme de l’occupation mensuelle', ({ assert }) => {
    const html = renderPerformanceReport(data, context)

    assert.include(html, '<svg')
  })

  test('masque le tableau par bien quand il n’y en a qu’un', ({ assert }) => {
    const html = renderPerformanceReport(
      { ...data, properties: [data.properties[0]] },
      context
    )

    assert.notInclude(html, 'Répartition par bien')
  })

  test('porte la note sur la mesure en jours écoulés', ({ assert }) => {
    const html = renderPerformanceReport(data, context)

    assert.include(html, 'jours écoulés')
  })

  test('ne divise pas par zéro sur un parc sans jour disponible', ({ assert }) => {
    const html = renderPerformanceReport(
      { ...data, occupied_days: 0, available_days: 0, gross_revenue: 0, properties: [] },
      context
    )

    assert.notInclude(html, 'Infinity')
    assert.notInclude(html, 'NaN')
  })
})
```

- [ ] **Étape 2 : Lancer les tests et vérifier qu'ils échouent**

Commande : `npm run test -- --files="tests/unit/reports/performance_report.spec.ts"`
Attendu : ÉCHEC, module introuvable.

- [ ] **Étape 3 : Implémenter**

Écrire `performance_report.ts` :

1. Section « Chiffres clés » : taux d'occupation
   (`occupied_days / available_days`, et 0 si le dénominateur est nul), jours
   occupés sur jours disponibles, séjour moyen, RevPAR via `computeRevpar`.
2. Histogramme SVG de `monthly_occupancy` : une barre par mois, hauteur
   proportionnelle au ratio.
3. Tableau « Répartition par bien », trié par taux d'occupation décroissant,
   **affiché seulement si `properties.length > 1`** — un tableau d'une ligne
   répéterait les chiffres clés.
4. Note de méthode : l'occupation se mesure sur les **jours écoulés**, comme
   `booking_stats.ts` et l'onglet Statistiques. Commentaire dans le code
   expliquant que diverger ferait afficher deux taux contradictoires dans la
   même application.

- [ ] **Étape 4 : Lancer les tests et vérifier qu'ils passent**

Commande : `npm run test -- --files="tests/unit/reports/performance_report.spec.ts"`
Attendu : SUCCÈS, 7 tests.

- [ ] **Étape 5 : Commiter**

```bash
git add app/features/reports/renderers/performance_report.ts tests/unit/reports/performance_report.spec.ts
git commit -m "feat(reports): renderer de la performance"
```

---

### Tâche 10 : Renderer du relevé des réservations

**Fichiers :**
- Créer : `app/features/reports/renderers/reservations_report.ts`
- Test : `tests/unit/reports/reservations_report.spec.ts`

**Interfaces :**
- Consomme : gabarit (tâche 7), `BookingSettlement` (tâche 3), `ReportContext`.
- Produit :
  - `interface ReservationRow { booking_id: string; check_in_at: Date; check_out_at: Date; property_title: string; client_name: string; client_phone: string; has_id_document: boolean; days_count: number; total_amount: number; settled_amount: number; source: 'online' | 'offline' }`
  - `function renderReservationsReport(rows: readonly ReservationRow[], context: ReportContext): string`

- [ ] **Étape 1 : Écrire les tests qui échouent**

```ts
import { test } from '@japa/runner'
import { renderReservationsReport } from '#features/reports/renderers/reservations_report'

const context = {
  owner_name: 'Kouassi',
  residence_name: null,
  period: {
    window: { from: new Date('2026-03-01T00:00:00Z'), to: new Date('2026-04-01T00:00:00Z') },
    label: 'Mars 2026',
    from_date: '2026-03-01',
    to_date: '2026-03-31',
  },
  generated_at: new Date('2026-04-02T09:30:00Z'),
}

const rows = [
  {
    booking_id: 'b1',
    check_in_at: new Date('2026-03-02T14:00:00Z'),
    check_out_at: new Date('2026-03-06T11:00:00Z'),
    property_title: 'Studio A',
    client_name: 'Aya Traoré',
    client_phone: '+225 07 00 00 00',
    has_id_document: true,
    days_count: 4,
    total_amount: 100000,
    settled_amount: 100000,
    source: 'online' as const,
  },
  {
    booking_id: 'b2',
    check_in_at: new Date('2026-03-10T14:00:00Z'),
    check_out_at: new Date('2026-03-12T11:00:00Z'),
    property_title: 'Studio B',
    client_name: 'Koffi N’Guessan',
    client_phone: '+225 05 11 11 11',
    has_id_document: false,
    days_count: 2,
    total_amount: 60000,
    settled_amount: 20000,
    source: 'offline' as const,
  },
]

test.group('renderReservationsReport', () => {
  test('affiche le nom et le téléphone du client', ({ assert }) => {
    const html = renderReservationsReport(rows, context)

    assert.include(html, 'Aya Traoré')
    assert.include(html, '+225 07 00 00 00')
  })

  test('dit « Fournie » ou « Non fournie », jamais « Vérifiée »', ({ assert }) => {
    const html = renderReservationsReport(rows, context)

    assert.include(html, 'Fournie')
    assert.include(html, 'Non fournie')
    assert.notInclude(html, 'Vérifiée')
  })

  test('distingue le canal en ligne du comptoir', ({ assert }) => {
    const html = renderReservationsReport(rows, context)

    assert.include(html, 'En ligne')
    assert.include(html, 'Comptoir')
  })

  test('liste les séjours au solde incomplet', ({ assert }) => {
    const html = renderReservationsReport(rows, context)

    assert.include(html, 'Paiements en attente')
    assert.match(html, /40\s?000/)
  })

  test('échappe un nom de client contenant du HTML', ({ assert }) => {
    const html = renderReservationsReport(
      [{ ...rows[0], client_name: '<b>Pirate</b>' }],
      context
    )

    assert.notInclude(html, '<b>Pirate</b>')
    assert.include(html, '&lt;b&gt;Pirate&lt;/b&gt;')
  })

  test('porte l’avertissement sur l’état de la pièce au moment de l’édition', ({ assert }) => {
    const html = renderReservationsReport(rows, context)

    assert.include(html, 'au moment de l’édition')
  })

  test('porte la mention sur les données personnelles', ({ assert }) => {
    const html = renderReservationsReport(rows, context)

    assert.include(html, 'données personnelles')
  })

  test('signale que les règlements en espèces n’apparaissent pas', ({ assert }) => {
    const html = renderReservationsReport(rows, context)

    assert.include(html, 'espèces')
  })

  test('reste valide sur une période sans réservation', ({ assert }) => {
    const html = renderReservationsReport([], context)

    assert.include(html, 'Aucune réservation sur la période')
  })
})
```

- [ ] **Étape 2 : Lancer les tests et vérifier qu'ils échouent**

Commande : `npm run test -- --files="tests/unit/reports/reservations_report.spec.ts"`
Attendu : ÉCHEC, module introuvable.

- [ ] **Étape 3 : Implémenter**

Écrire `reservations_report.ts` :

1. Section « Chiffres clés » : nombre de séjours, total encaissé (somme des
   `settled_amount`), reste à percevoir (somme des écarts positifs), et
   répartition en ligne / comptoir.
2. Tableau des séjours avec les colonnes de la spec. Les dates en
   `dd/MM/yyyy`. La colonne « Pièce » rend « Fournie » / « Non fournie » —
   jamais « Vérifiée », avec un commentaire rappelant qu'aucune vérification
   n'existe dans le modèle et que le mot induirait en erreur sur un document
   pouvant servir de preuve.
3. Section « Paiements en attente » listant les lignes dont
   `settled_amount < total_amount`, omise si aucune.
4. Trois mentions en pied de section :
   - la colonne « Pièce » reflète l'état **au moment de l'édition** et non
     celui du séjour, le nom et le téléphone étant eux figés au moment de la
     réservation ;
   - Wave étant le seul fournisseur, un règlement en **espèces** au comptoir
     n'apparaît pas comme encaissé ;
   - le document contient des **données personnelles**.
5. Sur une liste vide : « Aucune réservation sur la période ».

Tout champ client passe par `escapeHtml`.

- [ ] **Étape 4 : Lancer les tests et vérifier qu'ils passent**

Commande : `npm run test -- --files="tests/unit/reports/reservations_report.spec.ts"`
Attendu : SUCCÈS, 9 tests.

- [ ] **Étape 5 : Commiter**

```bash
git add app/features/reports/renderers/reservations_report.ts tests/unit/reports/reservations_report.spec.ts
git commit -m "feat(reports): renderer du releve des reservations"
```

---

### Tâche 11 : Use case d'orchestration

**Fichiers :**
- Créer : `app/features/reports/use_cases/generate_report.use_case.ts`

**Interfaces :**
- Consomme : tout ce qui précède, plus `GetFinanceOverviewUseCase`,
  `BookingRepository`, `ExpenseRepository`, `PropertyRepository`,
  `ResidenceRepository`, `OwnerRepository`.
- Produit :
  `class GenerateReportUseCase { execute(owner_id: string, input: GenerateReportInput): Promise<GeneratedReportDto> }`

- [ ] **Étape 1 : Relever les signatures réelles des dépendances**

Avant d'écrire, lire et noter les signatures exactes de :
- `app/features/finance/use_cases/get_finance_overview.use_case.ts`
- `app/features/bookings/repositories/booking_repository.ts`
- `app/features/expenses/repositories/expense_repository.ts`
- `app/features/booking_payments/repositories/`
- le repository qui donne le nom d'un propriétaire et d'une résidence

Le use case ne doit appeler **aucun** repository Firestore directement quand
un use case existe pour la même donnée : deux chemins de lecture divergent, et
un PDF qui contredit l'écran est un défaut découvert chez le client.

- [ ] **Étape 2 : Écrire le use case**

Structure :

```ts
export class GenerateReportUseCase {
  async execute(owner_id: string, input: GenerateReportInput): Promise<GeneratedReportDto> {
    // 1. Résoudre la période — lève invalid_report_period / report_period_too_large
    const period = resolveReportPeriod(input)

    // 2. Charger le contexte (propriétaire, résidence si filtrée)
    //    Une résidence inconnue ou appartenant à un autre propriétaire lève
    //    residence_not_found : sans ce contrôle, le rapport sortirait vide et
    //    l'utilisateur conclurait à une absence d'activité.

    // 3. Charger les données selon le type et composer le HTML

    // 4. Rendre le PDF, le téléverser, renvoyer le DTO
  }
}
```

Le nom de fichier suit `rapport-<type>-<période>.pdf`, en minuscules sans
accent ni espace (`rapport-financier-mars-2026.pdf`), suffixé d'un horodatage
court pour qu'une réédition n'écrase pas la précédente.

Toute erreur de rendu ou de téléversement est enveloppée en
`DomainError('report_generation_failed', 'La génération du rapport a échoué. Réessayez.', 500)`
— jamais de `throw new Error()` brut remontant du use case.

- [ ] **Étape 3 : Vérifier la compilation**

Commande : `npm run typecheck`
Attendu : SUCCÈS.

- [ ] **Étape 4 : Commiter**

```bash
git add app/features/reports/use_cases/generate_report.use_case.ts
git commit -m "feat(reports): orchestration de la generation de rapport"
```

---

### Tâche 12 : Validator, contrôleur et route

**Fichiers :**
- Créer : `app/validators/report/report.ts`,
  `app/controllers/proprio/report_controller.ts`
- Modifier : `start/routes.ts`

**Interfaces :**
- Consomme : `GenerateReportUseCase` (tâche 11).
- Produit : la route `POST /api/v1/proprio/reports`.

- [ ] **Étape 1 : Écrire le validator**

```ts
import vine from '@vinejs/vine'

/**
 * POST /proprio/reports
 *
 * `from` et `to` sont des dates nues, pas des instants : un rapport porte sur
 * des journées entières, et `to` est inclusif.
 */
export const generateReportValidator = vine.compile(
  vine.object({
    type: vine.enum(['financial', 'performance', 'reservations']),
    period: vine.enum(['this_month', 'last_month', 'this_year', 'custom']),
    from: vine.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: vine.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    residence_id: vine.string().trim().minLength(1).optional(),
  })
)
```

La cohérence entre `period: 'custom'` et la présence de `from`/`to` est
vérifiée dans `resolveReportPeriod`, pas ici : la règle y est déjà écrite et
testée, la dupliquer ferait diverger les deux messages.

- [ ] **Étape 2 : Écrire le contrôleur**

```ts
import { generateReportValidator } from '#validators/report/report'

import type { HttpContext } from '@adonisjs/core/http'

import GenerateReportUseCase from '../../features/reports/use_cases/generate_report.use_case.ts'

export default class ProprioReportController {
  /**
   * Édite un rapport PDF et renvoie une URL signée à durée limitée.
   */
  async store(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(generateReportValidator)

    const report = await new GenerateReportUseCase().execute(userId, payload)

    return ctx.response.ok({ data: report })
  }
}
```

- [ ] **Étape 3 : Déclarer la route**

Dans `start/routes.ts`, importer le contrôleur en haut avec les autres :

```ts
const ProprioReportController = () => import('#controllers/proprio/report_controller')
```

Puis ajouter le groupe après celui de `finance` :

```ts
        router
          .group(() => {
            router.post('/', [ProprioReportController, 'store'])
          })
          .prefix('reports')
          .as('reports')
```

- [ ] **Étape 4 : Vérifier**

Commandes : `npm run typecheck` puis `npm run lint`
Attendu : SUCCÈS pour les deux.

- [ ] **Étape 5 : Commiter**

```bash
git add app/validators/report/report.ts app/controllers/proprio/report_controller.ts start/routes.ts
git commit -m "feat(reports): route de generation de rapport"
```

---

### Tâche 13 : Contrat mobile — endpoint et modèle

**Dépôt : `mobile/`.** Commiter séparément de `api/`.

**Fichiers :**
- Modifier : `lib/core/api/api_endpoints.dart`
- Créer : `lib/features/rapport/data/models/report_export_model.dart`
- Supprimer : `lib/features/rapport/data/models/rapport_model.dart`
- Test : `test/features/rapport/report_export_model_test.dart`

**Interfaces :**
- Consomme : la réponse de la tâche 12.
- Produit : `ReportExportModel` avec `url`, `expiresAt`, `filename`,
  `periodFrom`, `periodTo`.

- [ ] **Étape 1 : Écrire le test qui échoue**

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:resi_africa/features/rapport/data/models/report_export_model.dart';

void main() {
  test('désérialise la réponse de génération', () {
    final model = ReportExportModel.fromJson({
      'url': 'https://res.cloudinary.com/x/rapport.pdf?__cld_token__=abc',
      'expires_at': '2026-09-15T14:30:00.000Z',
      'filename': 'rapport-financier-mars-2026.pdf',
      'period': {'from': '2026-03-01', 'to': '2026-03-31'},
    });

    expect(model.filename, 'rapport-financier-mars-2026.pdf');
    expect(model.periodFrom, '2026-03-01');
    expect(model.expiresAt.isUtc, isTrue);
  });

  test('un lien déjà expiré est signalé', () {
    final model = ReportExportModel.fromJson({
      'url': 'https://x',
      'expires_at': '2020-01-01T00:00:00.000Z',
      'filename': 'r.pdf',
      'period': {'from': '2026-03-01', 'to': '2026-03-31'},
    });

    expect(model.isExpired, isTrue);
  });
}
```

- [ ] **Étape 2 : Lancer le test et vérifier qu'il échoue**

Commande : `flutter test test/features/rapport/report_export_model_test.dart`
Attendu : ÉCHEC, fichier introuvable.

- [ ] **Étape 3 : Écrire le modèle**

```dart
/// Rapport PDF édité par l'API.
///
/// L'URL est **signée et périssable** : elle n'est jamais mise en cache SQLite,
/// contrairement aux biens et aux clients. La stocker produirait des liens
/// morts au premier réemploi différé.
class ReportExportModel {
  const ReportExportModel({
    required this.url,
    required this.expiresAt,
    required this.filename,
    required this.periodFrom,
    required this.periodTo,
  });

  final String url;
  final DateTime expiresAt;
  final String filename;
  final String periodFrom;
  final String periodTo;

  bool get isExpired => DateTime.now().toUtc().isAfter(expiresAt);

  factory ReportExportModel.fromJson(Map<String, dynamic> json) {
    final period = json['period'] as Map<String, dynamic>? ?? const {};

    return ReportExportModel(
      url: json['url'] as String,
      expiresAt: DateTime.parse(json['expires_at'] as String).toUtc(),
      filename: json['filename'] as String,
      periodFrom: period['from'] as String? ?? '',
      periodTo: period['to'] as String? ?? '',
    );
  }
}
```

- [ ] **Étape 4 : Mettre à jour l'endpoint**

Dans `api_endpoints.dart`, remplacer la constante `rapports` par :

```dart
  /// Génération d'un rapport PDF. Renvoie une URL signée à durée limitée.
  static const String reports = "/proprio/reports";
```

Supprimer `rapport_model.dart`, devenu sans objet.

- [ ] **Étape 5 : Lancer le test et vérifier qu'il passe**

Commande : `flutter test test/features/rapport/report_export_model_test.dart`
Attendu : SUCCÈS, 2 tests.

- [ ] **Étape 6 : Commiter**

```bash
git add lib/core/api/api_endpoints.dart lib/features/rapport/data/models/ test/features/rapport/
git commit -m "feat(rapport): modele d'export de rapport"
```

---

### Tâche 14 : Repository et cubit mobile

**Dépôt : `mobile/`.**

**Fichiers :**
- Modifier : `lib/features/rapport/data/repositories/rapport_repository.dart`,
  `lib/features/rapport/business_logic/report_form_cubit.dart`,
  `lib/features/rapport/business_logic/report_form_state.dart`,
  `lib/core/di/service_locator.dart`

**Interfaces :**
- Consomme : `ReportExportModel` (tâche 13).
- Produit : `RapportRepository.generate(...)`, et un `ReportFormState` portant
  le résultat ou l'erreur.

- [ ] **Étape 1 : Réécrire le repository**

```dart
/// Demande l'édition d'un rapport et rend le lien de téléchargement.
Future<ReportExportModel> generate({
  required ReportType type,
  required PeriodPreset preset,
  DateTime? customStart,
  DateTime? customEnd,
  String? residenceId,
}) async {
  try {
    final response = await _dio.post(
      ApiEndpoints.reports,
      data: {
        'type': type.apiValue,
        'period': preset.apiValue,
        if (preset == PeriodPreset.custom) 'from': _formatDay(customStart!),
        if (preset == PeriodPreset.custom) 'to': _formatDay(customEnd!),
        // Omis plutôt qu'envoyé à 'all' : côté API, l'absence de clé signifie
        // « toutes les résidences », et une sentinelle y serait cherchée comme
        // un identifiant.
        if (residenceId != null && residenceId != 'all') 'residence_id': residenceId,
      },
    );

    return ReportExportModel.fromJson(response.data['data'] as Map<String, dynamic>);
  } on DioException catch (e) {
    throw mapDioExceptionToFailure(e);
  }
}

/// Date nue `AAAA-MM-JJ` : l'API raisonne en journées entières, pas en instants.
String _formatDay(DateTime date) =>
    '${date.year.toString().padLeft(4, '0')}-'
    '${date.month.toString().padLeft(2, '0')}-'
    '${date.day.toString().padLeft(2, '0')}';
```

Ajouter `apiValue` en extension sur `ReportType` et `PeriodPreset` (valeurs
`financial`/`performance`/`reservations` et
`this_month`/`last_month`/`this_year`/`custom`).

- [ ] **Étape 2 : Étendre le state**

Ajouter à `ReportFormState` : `ReportExportModel? result` et
`String? errorMessage`, tous deux repris dans `copyWith`. Prévoir un moyen de
les remettre à `null` — un `copyWith` classique ne sait pas effacer un champ,
ce qui laisserait une erreur affichée après une génération réussie.

- [ ] **Étape 3 : Réécrire `generate()`**

```dart
Future<void> generate() async {
  emit(state.copyWith(isGenerating: true, clearError: true, clearResult: true));

  try {
    final report = await _repository.generate(
      type: state.selectedType,
      preset: state.selectedPreset,
      customStart: state.customStart,
      customEnd: state.customEnd,
      residenceId: state.selectedResidenceId,
    );

    if (!isClosed) emit(state.copyWith(isGenerating: false, result: report));
  } on AppFailure catch (failure) {
    if (!isClosed) {
      emit(state.copyWith(isGenerating: false, errorMessage: failure.userMessage));
    }
  }
}
```

Le cubit reçoit son repository par constructeur. L'enregistrer dans
`service_locator.dart` : `registerLazySingleton` pour le repository,
`registerFactory` pour le cubit.

- [ ] **Étape 4 : Vérifier**

Commandes : `flutter analyze` puis `flutter test`
Attendu : SUCCÈS pour les deux.

- [ ] **Étape 5 : Commiter**

```bash
git add lib/features/rapport/ lib/core/di/service_locator.dart
git commit -m "feat(rapport): appel de generation et etats du formulaire"
```

---

### Tâche 15 : Écran, renommages et retrait des types sans données

**Dépôt : `mobile/`.**

**Fichiers :**
- Modifier : `lib/features/rapport/data/models/report_type_model.dart`,
  `lib/features/rapport/presentation/screens/rapport_screen.dart`,
  `lib/features/rapport/presentation/widgets/report_type_selector.dart`,
  `lib/features/rapport/data/models/report_fake_data.dart`
- Renommer : `property_selector.dart` → `residence_selector.dart`,
  `property_model.dart` → `residence_model.dart`

- [ ] **Étape 1 : Retirer les deux types sans données**

Dans `report_type_model.dart`, ramener l'enum à :

```dart
/// Les trois rapports adossés à des données réelles.
///
/// `maintenance` et `fiscal` ont été retirés : le premier suppose une notion
/// d'intervention et de prestataire, le second un marqueur de déductibilité
/// sur les dépenses. Ni l'une ni l'autre n'existe côté API, et les proposer
/// donnerait un document qui promet plus qu'il ne montre.
enum ReportType { financial, performance, reservations }
```

Retirer les entrées correspondantes de `label`, `description` et `iconPath`,
ainsi que de `_icons` dans `report_type_selector.dart`.

- [ ] **Étape 2 : Renommer le sélecteur**

`PropertySelector` → `ResidenceSelector`, `PropertyModel` → `ResidenceModel`,
`selectedPropertyId` → `selectedResidenceId`, `properties` → `residences`.

Le widget liste déjà des résidences (« Toutes mes résidences ») : son nom
actuel ment sur la donnée, et quelqu'un finirait par y brancher un bien.

- [ ] **Étape 3 : Brancher l'écran sur le résultat**

Dans `rapport_screen.dart`, écouter le cubit via `BlocConsumer` :
- `result` non nul → ouvrir le lien (paquet `url_launcher`, en
  `LaunchMode.externalApplication`) ;
- `errorMessage` non nul → afficher le message dans une `SnackBar`.

Prendre couleurs et styles du thème, jamais de littéral. Vérifier le rendu en
clair **et** en sombre : `ThemeMode.system` est actif.

- [ ] **Étape 4 : Vérifier**

Commandes : `flutter analyze` puis `flutter test`
Attendu : SUCCÈS pour les deux.

Vérifier aussi qu'aucune référence à `PropertySelector`, `PropertyModel` ou
aux types retirés ne subsiste :

```bash
grep -rn "PropertySelector\|selectedPropertyId\|ReportType.maintenance\|ReportType.fiscal" lib/
```

Attendu : aucun résultat.

- [ ] **Étape 5 : Commiter**

```bash
git add lib/features/rapport/
git commit -m "feat(rapport): ecran de generation et retrait des types sans donnees"
```

---

## Vérification finale

Avant de considérer la feature terminée, dans `api/` :

```bash
npm run lint && npm run typecheck && npm run test
```

Dans `mobile/` :

```bash
flutter analyze && flutter test
```

Les trois commandes de l'API et les deux du mobile doivent passer. Une suite
qui échoue est un travail inachevé, pas un détail à signaler en passant.
