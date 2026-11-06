import { COLLECTIONS } from '#firebase/firestore'

import { PURGE_STEPS, type PurgeStep } from './purge_plan.ts'

/**
 * Export et réimport d'un compte — propriétaire comme client — avec les
 * ensembles de données choisis par l'administrateur.
 *
 * Les documents sont recopiés sous leur identifiant d'origine : les liens
 * entre eux (logement d'une réservation, fiche client, paiement) restent
 * justes sans réécriture. Seul le rattachement au compte se réécrit, quand le
 * compte a été recréé sous un autre identifiant.
 *
 * Le champ qui rattache chaque ensemble au compte vient du plan de
 * suppression définitive : une collection ajoutée au compte s'y déclare une
 * fois, pour la purge comme pour l'export.
 */

export const ACCOUNT_EXPORT_FORMAT = 'resi.account'
export const ACCOUNT_EXPORT_VERSION = 1

/**
 * Réservations prises par le compte en tant que client. Absentes du plan de
 * purge, qui les laisse à la comptabilité du propriétaire.
 */
const CLIENT_BOOKINGS_STEP: PurgeStep = {
  kind: 'query',
  key: 'client_bookings',
  label: 'Réservations prises',
  collection: COLLECTIONS.bookings,
  field: 'client_id',
}

function purgeStep(key: string): PurgeStep {
  const step = PURGE_STEPS.find((s) => s.key === key)
  if (!step) throw new Error(`Étape de purge inconnue : ${key}`)
  return step
}

export interface AccountSection {
  key: string
  label: string
  /** Rôles pour lesquels la section est cochée d'office. */
  roles: readonly string[]
  steps: readonly PurgeStep[]
}

/**
 * Ensembles proposés à l'export, dans l'ordre d'écriture à l'import : le
 * catalogue avant les réservations qui y renvoient.
 *
 * Restent hors de l'export : sessions et appareils (éphémères, rouverts à la
 * connexion), rapports édités (régénérables), affectations de gérants (les
 * comptes gérants ne voyagent pas avec le propriétaire).
 */
export const ACCOUNT_SECTIONS: readonly AccountSection[] = [
  {
    key: 'catalog',
    label: 'Résidences et logements',
    roles: ['proprio'],
    steps: [purgeStep('residences'), purgeStep('properties')],
  },
  {
    key: 'clients',
    label: 'Carnet clients',
    roles: ['proprio'],
    steps: [purgeStep('clients')],
  },
  {
    key: 'bookings',
    label: 'Réservations reçues et paiements',
    roles: ['proprio'],
    steps: [
      purgeStep('bookings'),
      purgeStep('booking_payments'),
      purgeStep('negotiations_as_owner'),
    ],
  },
  {
    key: 'expenses',
    label: 'Dépenses',
    roles: ['proprio'],
    steps: [purgeStep('expenses')],
  },
  {
    key: 'subscription',
    label: 'Abonnement et historique',
    roles: ['proprio'],
    steps: [
      purgeStep('subscriptions'),
      purgeStep('subscription_events'),
      purgeStep('subscription_payments'),
      purgeStep('subscription_credit'),
    ],
  },
  {
    key: 'wallet',
    label: 'Portefeuille et retraits',
    roles: ['proprio'],
    steps: [
      purgeStep('wallets'),
      purgeStep('wallet_transactions'),
      purgeStep('withdrawals'),
      purgeStep('payout_numbers'),
    ],
  },
  {
    key: 'client_bookings',
    label: 'Réservations prises comme client',
    roles: ['client'],
    steps: [CLIENT_BOOKINGS_STEP],
  },
  {
    key: 'sponsorship',
    label: 'Parrainage',
    roles: ['proprio', 'client'],
    steps: [
      purgeStep('sponsored'),
      purgeStep('sponsorship_transactions'),
      purgeStep('sponsorship_redemptions'),
      purgeStep('sponsorship_account'),
    ],
  },
  {
    key: 'activity',
    label: 'Retours, négociations et codes promo',
    roles: ['proprio', 'client'],
    steps: [
      purgeStep('feedbacks'),
      purgeStep('negotiations_as_client'),
      purgeStep('promo_code_usages'),
    ],
  },
]

export const ACCOUNT_SECTION_KEYS = ACCOUNT_SECTIONS.map((s) => s.key)

/** Étapes de transfert par clé, seule source des collections écrites à l'import. */
export const TRANSFER_STEPS: ReadonlyMap<string, PurgeStep> = new Map(
  ACCOUNT_SECTIONS.flatMap((section) => section.steps.map((step) => [step.key, step]))
)

export function sectionsByKeys(keys: readonly string[]): AccountSection[] {
  return ACCOUNT_SECTIONS.filter((section) => keys.includes(section.key))
}

export function sectionOfStep(stepKey: string): AccountSection | undefined {
  return ACCOUNT_SECTIONS.find((section) => section.steps.some((s) => s.key === stepKey))
}

/** Document exporté : identifiant d'origine et champs encodés (`encodeDocument`). */
export interface ExportedDocument {
  id: string
  data: Record<string, unknown>
}

export interface AccountExport {
  format: typeof ACCOUNT_EXPORT_FORMAT
  version: typeof ACCOUNT_EXPORT_VERSION
  exported_at: Date
  account: {
    id: string
    role: string
    full_name: string | null
    email: string | null
    phone: string | null
    /**
     * Document du compte, mot de passe chiffré compris : réimporté, le compte
     * se reconnecte comme avant. Le fichier est donc aussi sensible qu'un
     * accès au compte.
     */
    data: Record<string, unknown>
  }
  sections: string[]
  steps: Record<string, ExportedDocument[]>
}

/**
 * Le document appartient-il au compte exporté ?
 *
 * Contrôlé à l'import : un fichier retouché ne doit pas pouvoir glisser dans
 * la base des documents d'un autre compte sous couvert de celui-ci.
 */
export function belongsToAccount(step: PurgeStep, doc: ExportedDocument, accountId: string) {
  if (step.kind === 'doc') return doc.id === accountId
  return doc.data[step.field] === accountId
}

/**
 * Rattache un document au compte d'arrivée.
 *
 * Un document clé par le compte (numéros de versement, crédit, compte de
 * parrainage) change d'identifiant ; les autres changent de champ de
 * rattachement. Rien d'autre n'est touché : les identifiants internes
 * (logement, réservation, fiche) sont conservés à l'identique.
 */
export function rebindDocument(
  step: PurgeStep,
  doc: ExportedDocument,
  fromId: string,
  toId: string
): ExportedDocument {
  if (fromId === toId) return doc
  if (step.kind === 'doc') return { id: toId, data: doc.data }
  return { id: doc.id, data: { ...doc.data, [step.field]: toId } }
}

export interface AccountImportSectionReport {
  key: string
  label: string
  created: number
  /** Déjà présents : l'import complète sans écraser. */
  existing: number
  /** Écartés : n'appartenant pas au compte, logement disparu, doublon de numéro. */
  rejected: number
}

export interface AccountImportReport {
  account: {
    id: string
    full_name: string | null
    /** `created` : compte recréé ; `existing` : compte déjà présent, conservé tel quel. */
    status: 'created' | 'existing'
    matched_by: 'id' | 'email' | 'phone' | null
  }
  sections: AccountImportSectionReport[]
}

export interface StepImportPlan {
  documents: ExportedDocument[]
  existing: number
  rejected: number
}

/**
 * Trie les documents d'une étape : à écrire, déjà présents, écartés.
 *
 * Compléter sans écraser : un identifiant déjà en base est laissé tel quel,
 * ce qui rend l'import rejouable. `accept` porte les contrôles propres à une
 * étape (unicité du numéro dans un carnet, logement encore présent).
 */
export function planStepImport(
  step: PurgeStep,
  docs: readonly ExportedDocument[],
  input: {
    fromId: string
    toId: string
    existingIds: ReadonlySet<string>
    accept?: (doc: ExportedDocument) => boolean
  }
): StepImportPlan {
  const documents: ExportedDocument[] = []
  const seen = new Set<string>()
  let existing = 0
  let rejected = 0

  for (const raw of docs) {
    if (!belongsToAccount(step, raw, input.fromId)) {
      rejected++
      continue
    }

    const doc = rebindDocument(step, raw, input.fromId, input.toId)
    if (input.existingIds.has(doc.id) || seen.has(doc.id)) {
      existing++
      continue
    }
    if (input.accept && !input.accept(doc)) {
      rejected++
      continue
    }

    seen.add(doc.id)
    documents.push(doc)
  }

  return { documents, existing, rejected }
}
