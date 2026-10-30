import { DomainError } from '#utils/domain_error'

/**
 * Règles du parrainage, sans Firestore : testées seules.
 *
 * Vocabulaire : le **parrain** (`sponsor`) partage son code, le **filleul**
 * (`sponsored`) s'inscrit avec. « Parrainage » et non « referral » dans le
 * code : `referrer` désigne déjà l'apporteur d'affaire saisi au comptoir sur
 * une réservation, une tout autre notion — commission due par le
 * propriétaire, hors de la plateforme.
 *
 * Le parrain ne gagne rien à l'inscription — vingt faux comptes ne coûtent
 * rien à créer —, mais à la **première action qui rapporte** du filleul :
 * - filleul client : un séjour réservé en ligne, payé et terminé ;
 * - filleul propriétaire : un abonnement payé (l'essai gratuit ne compte pas).
 *
 * Le gain s'accumule sur un solde de parrainage. Passé un seuil, le parrain
 * le retire sur Wave ou le convertit : en crédit séjour pour un client, en
 * crédit d'abonnement pour un propriétaire.
 */

/** Rôles qui parrainent et qu'on parraine. Ni l'admin ni le gérant. */
export const SPONSORSHIP_ROLES = ['client', 'proprio'] as const
export type SponsorshipRole = (typeof SPONSORSHIP_ROLES)[number]

export function isSponsorshipRole(role: string | null | undefined): role is SponsorshipRole {
  return role === 'client' || role === 'proprio'
}

export const REWARD_MODES = ['fixed', 'percent'] as const
export type RewardMode = (typeof REWARD_MODES)[number]

export const REDEMPTION_TYPES = ['withdrawal', 'stay_credit', 'subscription_credit'] as const
export type RedemptionType = (typeof REDEMPTION_TYPES)[number]

/**
 * Ce que chaque rôle peut faire de son solde. Un client n'a pas d'abonnement,
 * un propriétaire ne réserve pas : chacun reçoit le crédit qu'il peut dépenser.
 */
export const REDEMPTION_TYPES_BY_ROLE: Record<SponsorshipRole, readonly RedemptionType[]> = {
  client: ['withdrawal', 'stay_credit'],
  proprio: ['withdrawal', 'subscription_credit'],
}

/** Gain dû pour un filleul d'un rôle donné. */
export interface RewardRule {
  /** `fixed` : `value` francs. `percent` : `value` % du montant payé. */
  mode: RewardMode
  value: number
  /** Plafond d'un gain en pourcentage. `null` : sans plafond. */
  max_amount: number | null
  /**
   * Jours pendant lesquels le gain reste en attente avant d'être disponible :
   * le temps qu'un remboursement reste possible. Un abonnement se résilie
   * avec remboursement les premiers jours ; un séjour terminé ne se rembourse
   * plus.
   */
  hold_days: number
}

export interface RedemptionRule {
  /** Montant minimal d'une demande — retrait ou conversion. */
  minimum_amount: number
  /** Usages ouverts, parmi ceux du rôle. */
  options: RedemptionType[]
}

export interface SponsorshipSettings {
  /**
   * Coupe les gains, pas les parrainages : un filleul inscrit pendant la
   * coupure reste rattaché, et sa première action qualifiante après la
   * réouverture rapporte.
   */
  enabled: boolean
  /** Par rôle du **filleul**. */
  rewards: Record<SponsorshipRole, RewardRule>
  /** Par rôle du **parrain**. */
  redemption: Record<SponsorshipRole, RedemptionRule>
  /** Jours, après l'inscription, pendant lesquels on peut encore saisir un code. */
  attach_window_days: number
}

/**
 * Réglages tant que le backoffice n'en a enregistré aucun. Gains coupés :
 * chaque franc versé est une dépense de RESI, et c'est à l'équipe d'en
 * décider le montant avant d'ouvrir les vannes.
 */
export const DEFAULT_SPONSORSHIP_SETTINGS: SponsorshipSettings = {
  enabled: false,
  rewards: {
    client: { mode: 'fixed', value: 100, max_amount: null, hold_days: 0 },
    proprio: { mode: 'fixed', value: 1000, max_amount: null, hold_days: 14 },
  },
  redemption: {
    client: { minimum_amount: 5000, options: ['withdrawal', 'stay_credit'] },
    proprio: { minimum_amount: 5000, options: ['withdrawal', 'subscription_credit'] },
  },
  attach_window_days: 30,
}

type PartialSettings = {
  enabled?: boolean
  rewards?: Partial<Record<SponsorshipRole, Partial<RewardRule>>>
  redemption?: Partial<Record<SponsorshipRole, Partial<RedemptionRule>>>
  attach_window_days?: number
}

/**
 * Réglages complets à partir d'un document éventuellement partiel. Chaque
 * champ absent prend sa valeur par défaut : un réglage ajouté après coup ne
 * fait pas tomber les documents déjà enregistrés.
 */
export function resolveSponsorshipSettings(
  stored: PartialSettings | null | undefined
): SponsorshipSettings {
  const defaults = DEFAULT_SPONSORSHIP_SETTINGS
  const reward = (role: SponsorshipRole): RewardRule => ({
    ...defaults.rewards[role],
    ...stored?.rewards?.[role],
  })
  const redemption = (role: SponsorshipRole): RedemptionRule => {
    const merged = { ...defaults.redemption[role], ...stored?.redemption?.[role] }
    // Un usage hors du rôle — un crédit d'abonnement pour un client — est
    // écarté plutôt que refusé : il ne peut venir que d'une écriture à la main.
    return {
      ...merged,
      options: merged.options.filter((o) => REDEMPTION_TYPES_BY_ROLE[role].includes(o)),
    }
  }

  return {
    enabled: stored?.enabled ?? defaults.enabled,
    rewards: { client: reward('client'), proprio: reward('proprio') },
    redemption: { client: redemption('client'), proprio: redemption('proprio') },
    attach_window_days: stored?.attach_window_days ?? defaults.attach_window_days,
  }
}

/**
 * Gain dû pour un montant payé, en francs entiers.
 *
 * Arrondi à l'inférieur : le franc CFA n'a pas de subdivision, et c'est RESI
 * qui paie. Un montant payé nul ne rapporte rien, même en mode fixe : un
 * abonnement entièrement couvert par un crédit n'a rien rapporté à RESI.
 */
export function computeReward(rule: RewardRule, paidAmount: number): number {
  if (!Number.isFinite(paidAmount) || paidAmount <= 0) return 0
  if (!Number.isFinite(rule.value) || rule.value <= 0) return 0

  if (rule.mode === 'fixed') return Math.floor(rule.value)

  const raw = Math.floor((paidAmount * rule.value) / 100)
  return rule.max_amount !== null && rule.max_amount >= 0 ? Math.min(raw, rule.max_amount) : raw
}

const DAY_MS = 24 * 60 * 60 * 1000

export function rewardAvailableAt(now: Date, holdDays: number): Date {
  return new Date(now.getTime() + Math.max(0, holdDays) * DAY_MS)
}

/**
 * Peut-on encore rattacher un parrain à ce compte ?
 *
 * Borné dans le temps : sans limite, deux comptes anciens s'arrangeraient
 * pour se parrainer l'un l'autre juste avant un gros paiement.
 */
export function isWithinAttachWindow(createdAt: Date, now: Date, windowDays: number): boolean {
  return now.getTime() - createdAt.getTime() <= windowDays * DAY_MS
}

/**
 * Alphabet des codes : sans 0/O ni 1/I/L, qu'on confond en dictant un code
 * au téléphone ou en le recopiant d'une capture.
 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_SUFFIX_LENGTH = 4
const CODE_PATTERN = /^[A-Z0-9]{4,12}$/

/**
 * Code saisi, ramené à sa forme canonique : majuscules, sans espace ni tiret.
 * `null` s'il ne peut pas être un code.
 */
export function normalizeSponsorshipCode(input: string | null | undefined): string | null {
  if (!input) return null
  const code = input.toUpperCase().replace(/[\s\-_.]/g, '')
  return CODE_PATTERN.test(code) ? code : null
}

/**
 * Code candidat : trois lettres du nom, pour qu'on reconnaisse le parrain,
 * puis quatre signes tirés au hasard. L'unicité est vérifiée à l'écriture :
 * le code est la clé de son document.
 */
export function buildSponsorshipCode(fullName: string, random: () => number = Math.random) {
  const letters = fullName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  const prefix = (letters + 'RESI').slice(0, 3)

  let suffix = ''
  for (let i = 0; i < CODE_SUFFIX_LENGTH; i++) {
    suffix += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length) % CODE_ALPHABET.length]
  }
  return prefix + suffix
}

/**
 * Vérifie qu'une demande sur le solde est possible.
 *
 * Le seuil vaut pour chaque demande : atteindre 5 000 F puis demander 100 F
 * ferait autant de transferts Wave manuels qu'on voudrait.
 */
export function assertRedemption(input: {
  type: RedemptionType
  amount: number
  role: SponsorshipRole
  balance: number
  rule: RedemptionRule
}): void {
  if (!input.rule.options.includes(input.type)) {
    throw new DomainError(
      'sponsorship_redemption_unavailable',
      'Cet usage de vos gains n’est pas disponible.',
      422
    )
  }

  if (!Number.isInteger(input.amount) || input.amount < input.rule.minimum_amount) {
    throw new DomainError(
      'sponsorship_amount_too_low',
      `Vos gains sont utilisables à partir de ${input.rule.minimum_amount} F.`,
      422
    )
  }

  if (input.amount > input.balance) {
    throw new DomainError(
      'sponsorship_insufficient_balance',
      'Le montant dépasse vos gains disponibles.',
      422
    )
  }
}
