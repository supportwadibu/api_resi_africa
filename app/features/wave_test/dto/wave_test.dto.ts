/** Session Wave telle que le banc d'essai la rend. */
export interface WaveTestSessionDto {
  checkout_id: string
  client_reference: string | null
  /** Chaîne, comme chez Wave. */
  amount: string
  currency: string
  /** `open`, `complete` ou `expired`. */
  checkout_status: string
  /** `processing`, `cancelled` ou `succeeded`. */
  payment_status: string
  transaction_id: string | null
  /** Lien à ouvrir pour payer ; absent une fois la session close. */
  wave_launch_url: string | null
  when_expires: Date | null
  last_payment_error: { code: string; message: string } | null
}

/** Configuration Wave de l'API : présence des secrets, jamais leur valeur. */
export interface WaveTestConfigDto {
  api_key: boolean
  api_signing_secret: boolean
  webhook_secret: boolean
  base_url: string
  currency: string
  app_url: string
  app_url_is_https: boolean
  /** URL à déclarer dans le portail Wave Business. */
  webhook_url: string
}
