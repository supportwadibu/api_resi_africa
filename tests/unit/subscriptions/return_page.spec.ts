import { test } from '@japa/runner'

import { appReturnLink, subscriptionReturnPage } from '#features/subscriptions/return_page'

test.group('retour de paiement vers l’application', () => {
  test('le lien rouvre l’écran des forfaits, succès ou échec', ({ assert }) => {
    assert.equal(appReturnLink('success'), 'resi://abonnement?statut=succes')
    assert.equal(appReturnLink('failure'), 'resi://abonnement?statut=echec')
  })

  test('un paiement en vérification ramène comme un succès', ({ assert }) => {
    // Wave ne renvoie ici qu'après un paiement réussi : l'application
    // confirmera elle-même au retour.
    assert.equal(appReturnLink('pending'), 'resi://abonnement?statut=succes')
  })

  test('la page ouvre l’application et garde un bouton de secours', ({ assert }) => {
    const html = subscriptionReturnPage('success')
    assert.include(html, 'resi://abonnement?statut=succes')
    assert.include(
      html,
      'intent://abonnement?statut=succes#Intent;scheme=resi;package=africa.resi.pro;end'
    )
    assert.include(html, 'Paiement reçu')
  })

  test('le script porte le nonce de la politique CSP', ({ assert }) => {
    // Sans lui, la CSP de l'API bloque la redirection automatique.
    assert.include(subscriptionReturnPage('success', 'abc123'), '<script nonce="abc123">')
    assert.include(subscriptionReturnPage('success'), '<script>')
  })
})
