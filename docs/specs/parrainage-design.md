# Parrainage

Objectif : plus d'inscrits. Un client ou un propriétaire partage son code ;
quand la personne inscrite avec ce code fait sa **première action qui
rapporte**, le parrain gagne un montant réglé au backoffice. Les gains
s'accumulent, et passé un seuil se retirent sur Wave ou se convertissent en
crédit.

Vocabulaire : **parrain** (`sponsor`), **filleul** (`sponsored`). Dans le code,
`sponsorship` et jamais `referral` : `referrer` désigne déjà l'apporteur
d'affaire d'une réservation comptoir, une commission due par le propriétaire,
hors plateforme.

## Ce qui rapporte

Rien n'est versé à l'inscription : vingt faux comptes ne coûtent rien à créer.
Le gain tombe une seule fois par filleul, sur sa première action qualifiante :

| Filleul | Action | Base d'un gain en % |
|---|---|---|
| Client | Séjour réservé **en ligne**, payé, terminé | `total_amount` du séjour |
| Propriétaire | Abonnement **payé** (jamais l'essai) | Montant payé, hors frais Wave |

Exclus délibérément :

- **Les réservations comptoir** (`source: offline`) : payées en espèces au
  propriétaire, RESI n'en voit pas l'argent, et un propriétaire pourrait en
  saisir de fausses pour ses propres filleuls.
- **Un séjour chez le parrain** (`owner_id` = parrain) : le parrain encaisserait
  le séjour et le gain, l'argent faisant un aller-retour par son portefeuille.
  Le parrainage reste ouvert pour le séjour suivant ailleurs.

## Attribution

- À l'inscription : `sponsorship_code` sur `POST /auth/register/verify` et
  `POST /auth/google` (création de compte seulement). Lu après vérification :
  un compte jamais vérifié n'est le filleul de personne. Non bloquant — un code
  faux est ignoré et journalisé —, d'où `GET /sponsorship/codes/:code`, public,
  que le formulaire appelle avant.
- Après coup : `POST /sponsorship/apply`, tant que le compte a moins de
  `attach_window_days` jours **et** aucune action payée. Sinon un client fidèle
  se ferait « parrainer » juste avant de payer.
- Refusés : son propre code, un parrain inactif ou hors `client`/`proprio`, et
  le parrainage croisé (A filleul de B ne parraine pas B).

Un filleul n'a qu'un parrain : le document `sponsorships/{id_du_filleul}`
porte la clé, Firestore n'ayant pas d'index unique. Même principe pour le code,
`sponsorship_codes/{CODE}`. Le code — trois lettres du nom, quatre signes sans
0/O/1/I/L — est créé à la première ouverture de l'écran Parrainage : les
comptes antérieurs en reçoivent un sans migration.

## Cycle d'un gain

```
registered ──(action qualifiante)──> pending ──(hold_days écoulés)──> earned
     │                                   │                              │
     └────────── cancelled <─────────────┴──────────────────────────────┘
```

- `hold_days` couvre le temps où un remboursement reste possible : 14 jours par
  défaut pour un abonnement (résiliation remboursée), 0 pour un séjour terminé.
  Une résiliation remboursée annule le gain encore `pending` qu'elle avait
  déclenché.
- La libération passe par `/cron/sponsorship-rewards`, et par chaque ouverture
  de l'écran ou demande du parrain : un ordonnanceur en retard ne prive
  personne.
- L'annulation d'un gain `earned` le reprend sur le solde, qui peut devenir
  négatif s'il a été dépensé — une dette soldée par les gains suivants, comme
  le portefeuille après un remboursement.
- La règle appliquée est **figée** sur le parrainage (`reward_rule`) : changer
  les réglages ne réécrit pas l'historique.

## Comptes et usages

`sponsorship_accounts/{user_id}` : `balance` (disponible), `pending_balance`,
`stay_credit` (client), totaux. Chaque mouvement l'ajuste dans la transaction
qui écrit sa ligne de `sponsorship_transactions`, à identifiant dérivé de sa
cause : un rejeu ne crédite jamais deux fois.

Une demande (`POST /sponsorship/redemptions`) débite au moins le seuil du rôle,
dans la limite du solde, vérifiés en transaction :

| Usage | Rôle | Effet |
|---|---|---|
| `withdrawal` | tous | Débité, versé à la main sur Wave par l'équipe, **sans frais** ; refusé, il revient au solde |
| `stay_credit` | client | Ajouté au crédit séjour, déduit des réservations suivantes |
| `subscription_credit` | propriétaire | Ajouté à `subscription_credits`, que la souscription déduit déjà ; échéance la plus lointaine conservée |

Un « mois d'abonnement offert » est un crédit d'abonnement du prix d'un mois :
il réutilise la déduction existante plutôt qu'un second mécanisme.

## Crédit séjour : RESI finance, le propriétaire touche le prix plein

Le propriétaire n'a pas choisi le programme : il ne doit pas le payer. Le
crédit est donc ajouté à ce que Wave encaisse quand le portefeuille est
crédité.

- `POST /client/bookings/:id/sponsorship-credit` applique le crédit à une
  réservation en ligne non payée, une fois. Les sessions Wave ouvertes au prix
  plein sont d'abord fermées.
- `booking.sponsorship_credit_amount` garde la part ; `total_amount` reste le
  prix du séjour, Finance n'en voit rien.
- Crédit partiel : la session Wave suivante ne demande que `amount_due`, et le
  crédit est figé sur le paiement (`metadata.sponsorship_credit_amount`) ;
  confirmation et remboursement créditent et débitent le portefeuille de
  `amount + crédit`.
- Crédit total : un paiement `provider: sponsorship_credit`, réussi d'emblée,
  sans session Wave.
- Le crédit revient au client à toute annulation où l'argent revient, et au
  séjour mené à terme sans paiement. Il reste consommé quand le propriétaire
  garde l'acompte.

## Réglages (`platform_settings/sponsorships`)

Gains **coupés par défaut** : chaque franc versé est une dépense de RESI, à
décider avant d'ouvrir. Coupés, les parrainages s'enregistrent toujours, et la
première action qualifiante après réouverture rapporte.

- `rewards.{client|proprio}` — par rôle du filleul : `mode` (`fixed` en F,
  `percent` du montant payé), `value`, `max_amount` (plafond d'un gain en %),
  `hold_days`.
- `redemption.{client|proprio}` — par rôle du parrain : `minimum_amount` (seuil
  d'une demande), `options` ouvertes.
- `attach_window_days` — délai de saisie d'un code après l'inscription.

## Mise en service

1. `firebase deploy --only firestore:indexes` — index `sponsorships`,
   `sponsorship_transactions`, `sponsorship_redemptions`.
2. Ordonnanceur : `GET /api/v1/cron/sponsorship-rewards`, une fois par jour.
3. Backoffice, section Parrainages : régler les montants, puis activer.

## Limites connues

- Pas de lien d'invitation qui pré-remplit le code : le partage envoie le code
  dans un message WhatsApp. Un lien profond demande un domaine vérifié et une
  configuration des stores.
- Le filleul ne reçoit rien : l'API n'a pas de récompense de bienvenue. Elle
  s'ajouterait sur le moteur des codes promo.
- Pas d'application cliente dans ces dépôts : l'API sert le parrainage et le
  crédit séjour aux clients, l'écran reste à faire de leur côté.
- La lutte contre la fraude s'arrête aux règles ci-dessus et à l'annulation
  manuelle : ni empreinte d'appareil, ni plafond mensuel par parrain.
