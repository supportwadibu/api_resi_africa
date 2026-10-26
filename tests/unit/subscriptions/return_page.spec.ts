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
      'intent://abonnement?statut=succes#Intent;scheme=resi;package=africa.resi.app;end'
    )
    assert.include(html, 'Paiement reçu')
  })
})
