# Acompte et arrivée par QR code

Décidé le 2026-11-12.

## Parcours

1. À la réservation en ligne, le client choisit de **payer la totalité** ou de
   **verser un acompte** par Wave.
2. Une fois la réservation enregistrée, il dispose d'une carte « Démarrer mon
   séjour » : un QR code et un PIN à six chiffres, en secours.
3. À la résidence, le propriétaire (ou son gérant) scanne le QR ou tape le PIN.
   La réservation s'affiche avec ce qui est déjà payé et le **reste à payer**.
4. Le reste s'encaisse au comptoir. **Tant qu'il n'est pas soldé, l'arrivée est
   refusée** par l'API : pas de clés.
5. Le reste soldé, le propriétaire valide l'arrivée : la réservation passe
   « En cours ».

Le reste se paie aujourd'hui au comptoir seulement. Le payer par Wave depuis
l'app reste possible plus tard.

## Réglage de l'acompte

Au backoffice (`/admin/settings/deposits`) :

- `enabled` : acompte proposé ou non. Coupé par défaut.
- `owner_can_set` : le propriétaire règle l'acompte de chaque logement
  (`properties.deposit`) ; sinon la règle de RESI s'impose à tous. Elle sert
  aussi de repli au logement jamais réglé.
- `type` et `value` : pourcentage (au plus 99 %) ou montant fixe en francs.

Un propriétaire peut refuser l'acompte sur un logement (`deposit.enabled =
false`) : seul le paiement total y est proposé. L'acompte est **figé** sur la
réservation à sa création (`online_deposit_amount`, `deposit_owner_amount`).

## Commission

La commission de RESI porte sur **tout le séjour**. L'acompte étant la seule
part qui passe par RESI, elle y est retenue en entier : **un acompte n'est
jamais inférieur à la part de RESI**. Si la règle donne moins, l'acompte est
relevé ; s'il atteint le prix, seul le paiement total est proposé.

Exemple : séjour à 100 000 F pour le client, 90 000 F pour le propriétaire,
acompte de 30 %. Le client verse 30 000 F par Wave ; RESI garde 10 000 F, le
portefeuille du propriétaire reçoit 20 000 F (`prepaid_amount`) ; le
propriétaire encaisse 70 000 F au comptoir.

## Contournements fermés

| Contournement | Parade |
|---|---|
| Annuler, rembourser l'acompte, encaisser tout en espèces. | Le client est remboursé en entier, la commission est **reprise au propriétaire** (`commission_charge`). Vaut pour tout remboursement décidé par le propriétaire. |
| Retirer l'acompte puis rembourser, aux frais de RESI. | La part de l'acompte reste **bloquée** (`held_balance`) jusqu'à l'arrivée ou la clôture pour absence. Un solde négatif bloque les retraits (règle existante). |
| Réserver par l'app, ne rien payer, tout régler au comptoir. | Une réservation en ligne n'ouvre pas de séjour sans paiement en ligne encaissé (`booking_online_unpaid`), et rien ne s'encaisse au comptoir sur une réservation réglée en ligne (`payment_not_expected`). |
| Prolonger sur place, en espèces. | La prolongation par le propriétaire d'un séjour vendu en ligne porte la commission sur les jours ajoutés, reprise au portefeuille. Le client ne prolonge plus lui-même une réservation avec acompte. |
| Baisser le prix après coup. | Inchangé : une réservation en ligne ne se modifie pas au comptoir, et la commission est figée. |
| Réduire l'acompte par le crédit parrainage. | Le crédit séjour ne s'applique qu'au paiement total (`credit_not_with_deposit`). |
| Déclarer absent un client venu. | Pas de bouton : l'absence ne se constate qu'à la clôture automatique, sans arrivée enregistrée. |
| Sonder les codes d'arrivée. | Jeton aléatoire de 144 bits ; PIN cherché parmi les seules réservations à venir du propriétaire, route limitée à 30 essais par 10 minutes ; même réponse pour un code inconnu et celui d'un autre. Le code n'est jamais exposé au propriétaire. |

Restent hors de ce lot, à traiter par détection : la saisie au comptoir d'un
client venu de l'app, et l'auto-réservation d'un propriétaire avec un code
promo.

## Annulation et absence

- Acompte versé : le client **ne peut plus annuler** depuis l'app
  (`deposit_cancel_at_property`). Le propriétaire annule et décide de garder
  ou de rendre l'acompte, comme aujourd'hui.
- Paiement total : le client annule et est remboursé en entier, comme
  aujourd'hui.
- Client jamais venu : la clôture automatique (`cron/stay-statuses`) le marque
  `no_show`. Le propriétaire garde l'acompte, débloqué. Avec un acompte, le
  revenu est ramené à ce qu'il a reçu (`total_amount = prepaid_amount`, le prix
  vendu restant dans `planned_total_amount`) ; la commission ne bouge pas.

## Contrat d'API

- `POST /client/properties/:property_id/bookings` accepte `payment_option`
  (`full` | `deposit`, `full` par défaut).
- La vue client d'une réservation ajoute `arrival_qr`, `arrival_pin`,
  `online_deposit_amount`, `payment_option`, `balance_due` ; `amount_due` vaut
  l'acompte quand il y en a un.
- La vue propriétaire ajoute `payment_option`, `prepaid_amount`,
  `balance_due`, `no_show`.
- `GET /proprio/bookings/arrival/:code` et `GET /gerant/bookings/arrival/:code`
  rendent `{ booking, check: { online_paid, can_check_in, blocker } }`.
- `POST /proprio/bookings/:id/payments` (`{ amount }`) : encaissement au
  comptoir, déjà ouvert au gérant.
- `GET /proprio/settings/deposit` : réglage lu par l'app propriétaire.
- `GET|PUT /admin/settings/deposits`.
- La fiche publique d'un logement porte `deposit_policy` (`{ type, value }` ou
  `null`) ; le montant exact est celui de la réservation créée.
- Le portefeuille expose `held_balance` ; deux types de mouvement :
  `deposit_release`, `commission_charge`.
