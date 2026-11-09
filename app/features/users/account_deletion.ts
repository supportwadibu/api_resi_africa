import type { RoleName } from '#models/role'
import type { AccountDeletionNoticeDto } from './dto/user.dto.ts'

const AMOUNT_FORMATTER = new Intl.NumberFormat('fr-FR')

export function formatAmount(value: number): string {
  return `${AMOUNT_FORMATTER.format(Math.round(value))} FCFA`
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count > 1 ? pluralForm : singular}`
}

/**
 * Ce qui reste en suspens sur un compte : argent dû et séjours en cours.
 * Lu une fois, puis formulé pour l'équipe (`warnings`) ou pour l'utilisateur
 * qui demande lui-même la suppression (`account_deletion.use_case.ts`).
 */
export interface PendingObligations {
  wallet_balance: number
  pending_withdrawals: number
  owner_ongoing_bookings: number
  client_ongoing_bookings: number
  sponsorship_balance: number
}

/**
 * Délai entre la demande de suppression et l'effacement définitif.
 *
 * Le compte est fermé dès la demande ; le délai ne sert qu'à rattraper une
 * erreur — un téléphone prêté, une demande regrettée — par une restauration
 * de l'équipe. C'est aussi le délai annoncé dans les règles de
 * confidentialité du site : l'un ne change pas sans l'autre.
 */
export const ACCOUNT_DELETION_GRACE_DAYS = 30

/** Ce qui bloque la suppression, et ce qu'elle fera perdre. */
export interface AccountDeletionNotices {
  blockers: AccountDeletionNoticeDto[]
  warnings: AccountDeletionNoticeDto[]
}

/**
 * Formule pour l'utilisateur ce qui reste en suspens sur son compte.
 *
 * Bloquent : l'argent qui lui est encore dû (il le perdrait sans recours
 * une fois le compte effacé) et les séjours en cours dans ses logements (des
 * voyageurs perdraient leur réservation). Le reste n'est qu'averti : des gains
 * de parrainage non utilisés ou ses propres séjours, que les propriétaires
 * conservent.
 */
export function accountDeletionNotices(
  role: RoleName,
  obligations: PendingObligations
): AccountDeletionNotices {
  const blockers: AccountDeletionNoticeDto[] = []
  const warnings: AccountDeletionNoticeDto[] = []

  if (obligations.wallet_balance > 0) {
    blockers.push({
      code: 'wallet_balance',
      message: `Votre portefeuille contient encore ${formatAmount(obligations.wallet_balance)}. Demandez-en le retrait avant de supprimer votre compte.`,
    })
  }
  if (obligations.pending_withdrawals > 0) {
    blockers.push({
      code: 'pending_withdrawals',
      message: `${plural(obligations.pending_withdrawals, 'retrait est', 'retraits sont')} en cours de versement. Attendez leur arrivée avant de supprimer votre compte.`,
    })
  }
  if (obligations.owner_ongoing_bookings > 0) {
    blockers.push({
      code: 'owner_ongoing_bookings',
      message: `${plural(obligations.owner_ongoing_bookings, 'séjour', 'séjours')} en cours ou à venir dans vos logements. Terminez-les ou annulez-les d'abord : vos clients perdraient leur réservation.`,
    })
  }

  if (obligations.client_ongoing_bookings > 0) {
    warnings.push({
      code: 'client_ongoing_bookings',
      message: `Vous avez ${plural(obligations.client_ongoing_bookings, 'séjour', 'séjours')} en cours ou à venir. La suppression ne les annule pas : contactez le propriétaire pour cela.`,
    })
  }
  if (obligations.sponsorship_balance > 0) {
    warnings.push({
      code: 'sponsorship_balance',
      message: `Vos gains et crédits de parrainage non utilisés (${formatAmount(obligations.sponsorship_balance)}) seront perdus.`,
    })
  }

  warnings.push(ROLE_WARNINGS[role])

  return { blockers, warnings }
}

/** Ce que la suppression emporte, selon le rôle — voir `purge_plan.ts`. */
const ROLE_WARNINGS: Record<RoleName, AccountDeletionNoticeDto> = {
  proprio: {
    code: 'owner_data',
    message:
      'Vos résidences, logements, réservations, carnet clients, dépenses, rapports et votre abonnement en cours seront supprimés définitivement.',
  },
  gerant: {
    code: 'manager_data',
    message:
      "Vous n'aurez plus accès aux logements que vous gérez. Ce que vous avez saisi reste dans le compte du propriétaire.",
  },
  client: {
    code: 'client_data',
    message:
      'Votre profil et votre historique de réservations seront supprimés. Les propriétaires gardent la trace des séjours passés chez eux.',
  },
  // Inatteignable : la suppression par soi-même est refusée à un administrateur.
  admin: { code: 'admin_data', message: 'Le compte et son accès au back-office seront supprimés.' },
}

/** Échéance de la suppression définitive d'une demande faite à `now`. */
export function purgeDate(now: Date): Date {
  return new Date(now.getTime() + ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000)
}
