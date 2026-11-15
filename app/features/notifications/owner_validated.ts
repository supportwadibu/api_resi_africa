import type { PushMessage } from './push_delivery.ts'

/**
 * Annonce au propriétaire que RESI a validé son dossier.
 *
 * Le texte invite à publier : la validation est le moment où le propriétaire
 * attend un signal pour mettre ses annonces en ligne.
 */
export function buildOwnerValidatedMessage(): PushMessage {
  return {
    title: 'Votre compte est validé',
    body: 'Votre dossier a été vérifié par RESI. Vous pouvez publier vos logements et recevoir des réservations.',
    data: { type: 'owner_validated' },
  }
}
