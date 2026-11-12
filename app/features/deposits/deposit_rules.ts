import { DomainError } from '#utils/domain_error'

/**
 * Acompte des réservations en ligne, sans Firestore : testé seul.
 *
 * Le client choisit à la réservation de tout payer ou de ne verser qu'un
 * acompte par Wave ; le reste se règle au comptoir, à l'arrivée, avant la
 * remise des clés. Décisions : `docs/specs/acompte-arrivee-design.md`.
 *
 * L'acompte passe seul par RESI : la commission, calculée sur tout le séjour,
 * y est donc retenue en entier. D'où la règle cardinale — un acompte n'est
 * jamais inférieur à la part de RESI, sinon le reste payé en espèces au
 * propriétaire emporterait une commission que RESI ne toucherait jamais.
 */

export const DEPOSIT_TYPES = ['percent', 'fixed'] as const
export type DepositType = (typeof DEPOSIT_TYPES)[number]

export const PAYMENT_OPTIONS = ['full', 'deposit'] as const
export type PaymentOption = (typeof PAYMENT_OPTIONS)[number]

/** `percent` : `value` % de ce que paie le client. `fixed` : `value` francs. */
export interface DepositRule {
  type: DepositType
  value: number
}

export interface DepositSettings extends DepositRule {
  /** Coupé : seul le paiement total est proposé, comme avant l'acompte. */
  enabled: boolean
  /**
   * Le propriétaire règle l'acompte de chacun de ses logements. Sinon la
   * règle de RESI s'impose à tous ; elle sert aussi de repli au logement que
   * son propriétaire n'a pas encore réglé.
   */
  owner_can_set: boolean
}

/** Réglage d'un logement par son propriétaire, lu quand RESI le lui permet. */
export interface PropertyDeposit extends DepositRule {
  /** Refusé : ce logement n'accepte que le paiement total. */
  enabled: boolean
}

/**
 * Tant que le backoffice n'a rien enregistré : acompte coupé, pour qu'un
 * déploiement ne change aucun parcours de paiement avant la décision de
 * l'équipe.
 */
export const DEFAULT_DEPOSIT_SETTINGS: DepositSettings = {
  enabled: false,
  owner_can_set: false,
  type: 'percent',
  value: 30,
}

/** 100 % reviendrait au paiement total : l'option n'aurait plus d'objet. */
export const MAX_DEPOSIT_PERCENT = 99

function isDepositType(value: unknown): value is DepositType {
  return typeof value === 'string' && (DEPOSIT_TYPES as readonly string[]).includes(value)
}

function positive(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

export function resolveDepositSettings(
  stored: Partial<DepositSettings> | null | undefined
): DepositSettings {
  return {
    enabled: stored?.enabled === true,
    owner_can_set: stored?.owner_can_set === true,
    type: isDepositType(stored?.type) ? stored.type : DEFAULT_DEPOSIT_SETTINGS.type,
    value: positive(stored?.value) || DEFAULT_DEPOSIT_SETTINGS.value,
  }
}

/** Réglage d'un logement tel que stocké, `null` s'il n'en a jamais reçu. */
export function resolvePropertyDeposit(
  stored: Partial<PropertyDeposit> | null | undefined
): PropertyDeposit | null {
  if (!stored || !isDepositType(stored.type)) return null
  return { enabled: stored.enabled === true, type: stored.type, value: positive(stored.value) }
}

function assertValidRule(rule: DepositRule, code: string): void {
  if (!(rule.value > 0)) {
    throw new DomainError(code, 'Indiquez un acompte supérieur à zéro.', 422)
  }
  if (rule.type === 'percent' && rule.value > MAX_DEPOSIT_PERCENT) {
    throw new DomainError(
      code,
      `Un acompte en pourcentage ne peut pas dépasser ${MAX_DEPOSIT_PERCENT} % : au-delà, c'est le paiement total.`,
      422
    )
  }
  if (rule.type === 'fixed' && !Number.isInteger(rule.value)) {
    throw new DomainError(code, 'Un acompte fixe s’exprime en francs entiers.', 422)
  }
}

export function assertValidDepositSettings(input: DepositSettings): void {
  assertValidRule(input, 'invalid_deposit_settings')
}

export function assertValidPropertyDeposit(input: PropertyDeposit): void {
  // Un acompte refusé n'a pas à porter de montant valable : seul l'interrupteur compte.
  if (input.enabled) assertValidRule(input, 'invalid_property_deposit')
}

/**
 * Règle à appliquer aux nouvelles réservations de ce logement, `null` si
 * seul le paiement total y est proposé.
 */
export function effectiveDepositRule(
  settings: DepositSettings,
  property: Partial<PropertyDeposit> | null | undefined
): DepositRule | null {
  if (!settings.enabled) return null
  const own = settings.owner_can_set ? resolvePropertyDeposit(property) : null
  if (own) return own.enabled && own.value > 0 ? { type: own.type, value: own.value } : null
  return settings.value > 0 ? { type: settings.type, value: settings.value } : null
}

/**
 * Acompte à verser en ligne, en francs, ou `null` si l'option n'a pas lieu
 * d'être pour ce séjour.
 *
 * [clientTotal] : ce que paie le client, code promo déduit. [resiShare] : ce
 * que RESI garde sur le séjour (`net_amount`), négatif quand un code promo
 * dépasse la majoration.
 *
 * Relevé à la part de RESI si la règle donne moins : voir l'en-tête. Un
 * acompte qui atteindrait le prix du séjour n'est plus un acompte — seul le
 * paiement total est alors proposé.
 */
export function depositAmountFor(
  rule: DepositRule | null,
  clientTotal: number,
  resiShare: number
): number | null {
  if (!rule || !(clientTotal > 0)) return null
  const raw =
    rule.type === 'percent' ? Math.round((clientTotal * rule.value) / 100) : Math.round(rule.value)
  const amount = Math.max(raw, Math.max(0, Math.ceil(resiShare)))
  if (amount <= 0 || amount >= clientTotal) return null
  return amount
}

/** Champs d'acompte figés sur une réservation en ligne. */
export interface DepositBookingFields {
  payment_option: PaymentOption
  online_deposit_amount?: number
  deposit_owner_amount?: number
}

/**
 * Champs à figer à la création, selon l'option choisie par le client.
 *
 * La part du propriétaire est ce que l'acompte lui laisse une fois la part de
 * RESI retenue : elle seule entre à son portefeuille, comme `owner_amount`
 * pour un paiement total.
 *
 * @throws `deposit_not_available` si le client demande un acompte que ce
 *   logement ou ce séjour ne propose pas
 */
export function depositBookingFields(
  option: PaymentOption,
  rule: DepositRule | null,
  clientTotal: number,
  ownerTotal: number
): DepositBookingFields {
  if (option === 'full') return { payment_option: 'full' }

  const resiShare = clientTotal - ownerTotal
  const amount = depositAmountFor(rule, clientTotal, resiShare)
  if (amount === null) {
    throw new DomainError(
      'deposit_not_available',
      'Ce séjour se règle en totalité : l’acompte n’est pas proposé.',
      422
    )
  }
  return {
    payment_option: 'deposit',
    online_deposit_amount: amount,
    deposit_owner_amount: amount - resiShare,
  }
}

/**
 * Reste à encaisser au comptoir, vu du propriétaire : son prix moins ce qu'il
 * a déjà reçu, en ligne (`prepaid_amount`) et de la main à la main
 * (`deposit_amount`).
 *
 * Replis : l'historique ne porte ni `prepaid_amount` ni `received_amount`.
 */
export function ownerBalanceDue(booking: {
  received_amount?: number
  total_amount?: number
  deposit_amount?: number
  prepaid_amount?: number
}): number {
  const price = booking.received_amount ?? booking.total_amount ?? 0
  const paid = (booking.deposit_amount ?? 0) + (booking.prepaid_amount ?? 0)
  return Math.max(0, price - paid)
}
