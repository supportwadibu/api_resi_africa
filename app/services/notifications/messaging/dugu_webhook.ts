import crypto from 'node:crypto'

/**
 * Au-delà, une livraison authentique rejouée plus tard est refusée : elle
 * reste signée, seul l'horodatage borne sa validité. DUGU relance au plus
 * tôt 60 s après un échec, chaque relance étant signée à nouveau.
 */
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60

/**
 * La doc DUGU ne précise pas l'unité de `t`. Un horodatage en secondes reste
 * sous ce seuil jusqu'en 33658 ; au-dessus, c'est des millisecondes.
 */
const MILLISECONDS_THRESHOLD = 1e12

/**
 * Événements qui disent qu'un message n'a pas atteint l'usager : un code
 * d'inscription ou de réinitialisation n'est jamais arrivé.
 */
export const DUGU_DELIVERY_FAILURE_EVENTS = new Set(['communication.failed', 'otp.failed'])

/**
 * Vérifie `X-Dugu-Signature: t=<horodatage>,v1=<hmac>`.
 *
 * Même forme d'en-tête que Wave, mais pas le même HMAC : DUGU signe
 * `horodatage + "." + corps`, Wave `horodatage + corps`. La signature porte
 * sur le corps **brut** ; plusieurs `v1` sont acceptés pour couvrir une
 * rotation du secret.
 */
export function verifyDuguSignature(
  secret: string,
  rawBody: string,
  header: string | undefined,
  now: Date = new Date()
): boolean {
  if (!header) return false

  const parts = header.split(',').map((part) => part.trim())
  const timestamp = parts.find((part) => part.startsWith('t='))?.slice(2)
  const signatures = parts.filter((part) => part.startsWith('v1=')).map((part) => part.slice(3))
  if (!timestamp || signatures.length === 0) return false

  const raw = Number(timestamp)
  if (!Number.isFinite(raw)) return false
  const sentAtSeconds = raw > MILLISECONDS_THRESHOLD ? raw / 1000 : raw
  if (Math.abs(now.getTime() / 1000 - sentAtSeconds) > WEBHOOK_TOLERANCE_SECONDS) return false

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex')

  return signatures.some(
    (signature) =>
      signature.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  )
}

/**
 * Identifiant de l'OTP visé, pour relier une livraison aux journaux de la
 * demande. Le format du corps n'est pas publié par DUGU : on le cherche à la
 * racine puis sous `data`, sans rien supposer d'autre.
 */
export function duguOtpIdOf(payload: Record<string, unknown>): string | null {
  const data = payload.data as Record<string, unknown> | undefined
  const id = data?.otp_id ?? payload.otp_id
  return typeof id === 'string' && id.length > 0 ? id : null
}
