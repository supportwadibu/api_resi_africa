/**
 * Identifiant de la session Wave citée par un webhook, `null` s'il manque.
 *
 * Le corps n'est qu'un signal : il désigne la session à relire chez Wave, et
 * rien d'autre n'en est cru — quiconque connaît l'identifiant d'une session
 * peut forger un corps qui la dit payée. Plusieurs emplacements sont lus : les
 * versions de l'événement Wave ne le rangent pas au même endroit.
 */
export function extractCheckoutId(payload: Record<string, any>): string | null {
  const value =
    payload.checkout_session_id ??
    payload.checkout_id ??
    payload.data?.checkout_session_id ??
    payload.data?.id ??
    payload.id
  return value ? String(value) : null
}
