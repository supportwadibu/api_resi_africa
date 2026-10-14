import type { PushMessage } from './push_delivery.ts'

/**
 * Relances d'échéance d'abonnement : J-7, J-3 et le jour même.
 *
 * Les jours sont des jours **calendaires** d'Abidjan (UTC+0, sans heure
 * d'été) : un abonnement qui finit ce soir à 23 h expire « aujourd'hui », pas
 * « dans 0,6 jour ».
 */

export type ReminderStage = 7 | 3 | 0

const DAY = 24 * 60 * 60 * 1000

function startOfDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

/** Jours calendaires restants avant l'échéance. Négatif : déjà échu. */
export function daysLeft(endDate: Date, now: Date): number {
  return Math.round((startOfDay(endDate) - startOfDay(now)) / DAY)
}

/**
 * Étape de relance due, ou `null`.
 *
 * Une étape vaut pour un **intervalle**, pas un jour exact : si le cron n'a
 * pas tourné à J-7, il rattrape la relance à J-6 ou J-5 au lieu de se taire
 * jusqu'à J-3. `reminderDispatchId` empêche ensuite qu'une étape parte deux
 * fois.
 */
export function reminderStage(endDate: Date, now: Date): ReminderStage | null {
  const left = daysLeft(endDate, now)
  if (left < 0 || left > 7) return null
  if (left === 0) return 0
  if (left <= 3) return 3
  return 7
}

/**
 * Échéances à examiner : d'aujourd'hui 0 h à la fin du septième jour.
 *
 * Bornée sur `end_date`, le champ en inégalité de la requête — couverte par
 * l'index `status + end_date` déjà déclaré.
 */
export function reminderWindow(now: Date): { from: Date; to: Date } {
  const from = startOfDay(now)
  return { from: new Date(from), to: new Date(from + 8 * DAY) }
}

/**
 * Identifiant de la trace d'envoi, qui porte l'idempotence.
 *
 * L'ordonnanceur peut appeler plusieurs fois par jour, ou rejouer après un
 * échec : la trace est créée par `create()`, qui échoue si elle existe, et
 * une étape ne part donc qu'une fois. L'échéance entre dans la clé : un
 * abonnement renouvelé repart pour un nouveau cycle de relances.
 */
export function reminderDispatchId(
  subscriptionId: string,
  stage: ReminderStage,
  endDate: Date
): string {
  return `${subscriptionId}:j${stage}:${endDate.toISOString().slice(0, 10)}`
}

const DATE = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Africa/Abidjan',
})

export function buildReminderMessage(
  subscription: { id: string; is_trial: boolean; end_date: Date },
  now: Date
): PushMessage {
  const left = Math.max(0, daysLeft(subscription.end_date, now))
  const subject = subscription.is_trial ? 'Votre essai gratuit' : 'Votre abonnement'
  const verb = subscription.is_trial ? 'se termine' : 'expire'

  const when = left === 0 ? 'aujourd’hui' : left === 1 ? 'demain' : `dans ${left} jours`

  const body =
    left === 0
      ? 'Renouvelez-le dès maintenant pour garder l’accès à vos réservations, votre carnet et vos rapports.'
      : `Renouvelez-le avant le ${DATE.format(subscription.end_date)} pour continuer sans interruption.`

  return {
    title: `${subject} ${verb} ${when}`,
    body,
    data: {
      type: 'subscription_expiry',
      subscription_id: subscription.id,
      days_left: String(left),
    },
  }
}
