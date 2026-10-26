/**
 * Page où Wave renvoie le navigateur après un paiement d'abonnement, quand
 * aucun site (`SITE_URL`) n'est configuré.
 *
 * Elle rouvre l'application par `resi://abonnement?statut=…`, le lien que lit
 * `PaymentReturnLinks` côté mobile : sans lui, le propriétaire restait sur une
 * page de l'API sans chemin de retour. Le lien ne fait foi de rien — le
 * paiement est déjà confirmé côté serveur —, il dit seulement quoi annoncer.
 */

export type ReturnOutcome = 'success' | 'failure' | 'pending'

/** Identifiant Android de l'application, pour le lien `intent://`. */
const ANDROID_PACKAGE = 'africa.resi.app'

function statut(outcome: ReturnOutcome): 'succes' | 'echec' {
  // En vérification : Wave ne renvoie ici qu'après un paiement réussi, et
  // l'écran des forfaits confirmera lui-même au retour.
  return outcome === 'failure' ? 'echec' : 'succes'
}

export function appReturnLink(outcome: ReturnOutcome): string {
  return `resi://abonnement?statut=${statut(outcome)}`
}

/**
 * Lien du bouton sur Android : Chrome bloque la redirection automatique vers
 * un schéma propre sans geste de l'utilisateur, mais suit toujours un lien
 * `intent://` touché, et propose le Play Store si l'application manque.
 */
function androidIntentLink(outcome: ReturnOutcome): string {
  return `intent://abonnement?statut=${statut(outcome)}#Intent;scheme=resi;package=${ANDROID_PACKAGE};end`
}

const MESSAGES: Record<ReturnOutcome, string> = {
  success: 'Paiement reçu. Votre abonnement est actif.',
  failure: "Le paiement n'a pas abouti. Vous pouvez réessayer depuis l'application.",
  pending: 'Paiement en cours de vérification.',
}

export function subscriptionReturnPage(outcome: ReturnOutcome): string {
  const appLink = appReturnLink(outcome)
  const intentLink = androidIntentLink(outcome)

  return (
    `<!doctype html><html lang="fr"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>RESI — Abonnement</title></head>` +
    `<body style="font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1rem;text-align:center;color:#111">` +
    `<h1 style="font-size:1.25rem">${MESSAGES[outcome]}</h1>` +
    `<p>Retour dans l'application RESI…</p>` +
    `<a id="open" href="${appLink}" style="display:inline-block;margin-top:1rem;padding:.75rem 1.25rem;background:#111;color:#fff;text-decoration:none;border-radius:12px">Revenir dans RESI</a>` +
    `<script>` +
    `var android=/android/i.test(navigator.userAgent);` +
    `if(android)document.getElementById('open').href=${JSON.stringify(intentLink)};` +
    `window.location.href=${JSON.stringify(appLink)};` +
    `</script></body></html>`
  )
}
