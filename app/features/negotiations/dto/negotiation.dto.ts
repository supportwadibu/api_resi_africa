/**
 * État d'une négociation, tel que l'application cliente l'affiche.
 *
 * - `not_negotiable` : le logement ne se négocie pas ;
 * - `offer` : `offers` liste les paliers révélés, le dernier vient d'être
 *   proposé ;
 * - `exhausted` : « Négocier encore » n'a plus rien à révéler, le client
 *   choisit un palier de `offers` ou le prix normal.
 */
export interface NegotiationDto {
  status: 'not_negotiable' | 'offer' | 'exhausted'
  /** Prix normal par jour. */
  daily_price: number
  /** `level` est à renvoyer tel quel à la réservation (`negotiation_level`). */
  offers: { level: number; daily_price: number }[]
}
