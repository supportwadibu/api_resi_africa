import NotifyUserUseCase from '#features/notifications/use_cases/notify_user.use_case'
import type { PushMessage } from '#features/notifications/push_delivery'

/** Ce qu'il faut d'une réservation pour l'annoncer. */
export interface BookedStay {
  id: string
  owner_id: string
  start_date?: Date | null
  end_date?: Date | null
  check_in_at?: Date | null
  check_out_at?: Date | null
  property?: { title?: string | null } | null
}

/**
 * Prévient le propriétaire de chaque réservation enregistrée sur ses biens.
 *
 * Deux cas : une réservation en ligne dont le paiement vient d'aboutir — avant,
 * elle n'engage rien et peut encore échouer —, et une saisie au comptoir faite
 * par un gérant. Le propriétaire qui saisit lui-même n'est pas notifié de son
 * propre geste.
 *
 * Jamais bloquant : `NotifyUserUseCase` ne lève pas, et la réservation est
 * déjà écrite quand on l'annonce.
 */
export class BookingNotifier {
  constructor(private notifier: Pick<NotifyUserUseCase, 'execute'> = new NotifyUserUseCase()) {}

  async onlineBookingPaid(booking: BookedStay): Promise<void> {
    await this.notifier.execute(booking.owner_id, buildBookingMessage(booking, 'online'))
  }

  async counterBookingByManager(booking: BookedStay): Promise<void> {
    await this.notifier.execute(booking.owner_id, buildBookingMessage(booking, 'manager'))
  }
}

const DAY = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  // Mois en toutes lettres : l'abrégé finit par un point, doublé en fin de phrase.
  month: 'long',
  // Côte d'Ivoire : l'heure du serveur peut être celle d'un autre fuseau.
  timeZone: 'Africa/Abidjan',
})

/** Texte de la notification, à part pour s'éprouver sans FCM. */
export function buildBookingMessage(
  booking: BookedStay,
  origin: 'online' | 'manager'
): PushMessage {
  // Réservation comptoir : `check_in_at` / `check_out_at` ; en ligne :
  // `start_date` / `end_date`. Une date absente réduit la phrase, sans lever.
  const start = booking.check_in_at ?? booking.start_date ?? null
  const end = booking.check_out_at ?? booking.end_date ?? null
  const period =
    start && end
      ? ` du ${DAY.format(start)} au ${DAY.format(end)}`
      : start
        ? ` à partir du ${DAY.format(start)}`
        : ''
  const place = booking.property?.title ? ` pour ${booking.property.title}` : ''

  return {
    title: 'Nouvelle réservation',
    body:
      origin === 'online'
        ? `Réservation payée en ligne${place}${period}.`
        : `Un gérant a enregistré une réservation${place}${period}.`,
    data: { type: 'booking_created', booking_id: booking.id },
  }
}

export default BookingNotifier
