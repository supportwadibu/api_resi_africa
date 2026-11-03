import proxyAddr from 'proxy-addr'

export type TrustProxyFn = (address: string, distance: number) => boolean

/**
 * Proxys dont l'en-tête `X-Forwarded-For` fait foi, lus dans `TRUST_PROXY`.
 *
 * L'IP du client sert à la limite de débit et aux traces d'audit. Derrière le
 * proxy de l'hébergeur, l'adresse vue par Node est celle du proxy : sans
 * réglage, tous les clients partagent alors un même quota. À l'inverse, faire
 * confiance à tout l'en-tête laisserait chacun choisir son IP — et changer de
 * quota à chaque requête.
 *
 * - absent : `loopback`, le défaut d'AdonisJS ;
 * - un entier `n` : les `n` derniers sauts sont des proxys de confiance ;
 * - sinon une liste d'adresses, de plages CIDR ou de préréglages `proxy-addr`
 *   (`loopback`, `linklocal`, `uniquelocal`), séparés par des virgules.
 *
 * `true` est refusé au démarrage : il ferait confiance à l'en-tête entier.
 */
export function parseTrustProxy(value?: string | null): TrustProxyFn {
  const raw = value?.trim()
  if (!raw) return proxyAddr.compile('loopback')

  if (raw === 'true' || raw === '*') {
    throw new Error(
      'TRUST_PROXY : « true » ferait confiance à toute adresse annoncée par le client. ' +
        'Indiquez le nombre de proxys (ex. « 1 ») ou leurs plages.'
    )
  }

  if (/^\d+$/.test(raw)) {
    const hops = Number(raw)
    return (_address, distance) => distance < hops
  }

  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)

  try {
    return proxyAddr.compile(entries)
  } catch (error) {
    throw new Error(`TRUST_PROXY : « ${raw} » n'est pas une liste d'adresses valide.`, {
      cause: error,
    })
  }
}
