import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

/**
 * Code d'arrivée d'une réservation en ligne : le QR que le client présente au
 * comptoir, et son PIN de secours.
 *
 * Le QR porte un jeton aléatoire, jamais l'identifiant de la réservation : un
 * identifiant se devine ou se lit ailleurs, et la seule possession du QR doit
 * prouver que le client est là. Le préfixe distingue un QR de RESI de tout
 * autre code scanné par mégarde.
 */
export const ARRIVAL_QR_PREFIX = 'resi-arrival:'

const PIN_PATTERN = /^\d{6}$/
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,64}$/

export interface ArrivalCode {
  check_in_token: string
  check_in_pin: string
}

export function generateArrivalCode(): ArrivalCode {
  return {
    // 18 octets : 144 bits, hors de portée d'un tirage au hasard.
    check_in_token: randomBytes(18).toString('base64url'),
    check_in_pin: String(randomInt(0, 1_000_000)).padStart(6, '0'),
  }
}

export type ParsedArrivalCode = { kind: 'token'; value: string } | { kind: 'pin'; value: string }

/**
 * Lit ce que le propriétaire a scanné ou saisi : le contenu du QR, le jeton
 * seul, ou le PIN — espaces et tirets tolérés, l'app client l'affiche en
 * « 245-252 ». `null` pour tout le reste.
 */
export function parseArrivalCode(raw: string): ParsedArrivalCode | null {
  const input = raw.trim()
  const digits = input.replace(/[\s-]/g, '')
  if (PIN_PATTERN.test(digits)) return { kind: 'pin', value: digits }

  const token = input.startsWith(ARRIVAL_QR_PREFIX) ? input.slice(ARRIVAL_QR_PREFIX.length) : input
  return TOKEN_PATTERN.test(token) ? { kind: 'token', value: token } : null
}

function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/**
 * Le code présenté désigne-t-il bien cette réservation ?
 *
 * Comparaison à temps constant : le PIN n'a que six chiffres, et une
 * comparaison qui s'arrête au premier caractère faux renseignerait sur les
 * suivants.
 */
export function matchesArrivalCode(
  booking: { check_in_token?: string; check_in_pin?: string },
  rawCode: string | undefined
): boolean {
  const code = rawCode ? parseArrivalCode(rawCode) : null
  if (!code) return false
  const expected = code.kind === 'token' ? booking.check_in_token : booking.check_in_pin
  return expected !== undefined && sameSecret(code.value, expected)
}
