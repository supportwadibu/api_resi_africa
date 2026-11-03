/**
 * Liste blanche des origines navigateur autorisées par CORS, lue dans
 * `CORS_ALLOWED_ORIGINS` (origines séparées par des virgules).
 *
 * Aucun client actuel n'appelle l'API depuis un navigateur : le mobile est
 * natif, et le backoffice passe par ses composants serveur. La liste est donc
 * vide par défaut, et toute requête navigateur d'une autre origine refusée.
 *
 * Chaque entrée doit être une origine exacte — schéma, hôte, port. Le joker
 * `*` et une URL portant un chemin sont refusés au démarrage plutôt
 * qu'ignorés : une liste mal saisie ouvrirait l'API à tous, ou laisserait
 * croire qu'une origine est autorisée alors qu'elle ne correspond jamais à
 * l'en-tête `Origin`, qui ne porte pas de chemin.
 */
export function parseCorsOrigins(value?: string | null): string[] {
  if (!value) return []

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      if (entry === '*') {
        throw new Error('CORS_ALLOWED_ORIGINS : le joker « * » est interdit, listez les origines.')
      }

      let url: URL
      try {
        url = new URL(entry)
      } catch {
        throw new Error(`CORS_ALLOWED_ORIGINS : « ${entry} » n'est pas une origine valide.`)
      }

      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new Error(`CORS_ALLOWED_ORIGINS : « ${entry} » doit être en http ou https.`)
      }
      if (url.origin !== entry.replace(/\/$/, '')) {
        throw new Error(
          `CORS_ALLOWED_ORIGINS : « ${entry} » porte un chemin ; attendu « ${url.origin} ».`
        )
      }

      return url.origin
    })
}
