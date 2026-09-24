# Départ anticipé — design

## Besoin

À la clôture d'un séjour, le propriétaire répond à « Le client a-t-il utilisé
tout son séjour ? ».

- **Oui** : seul le statut passe à `completed`. Dates et montant inchangés
  (comportement historique de `buildCheckOutPatch`).
- **Non** : la sortie et le montant sont ramenés à l'usage réel, l'écart est
  consigné comme remboursé.

## Règles

- **Jours facturés** : tout jour entamé est dû (`Math.ceil`), minimum 1, au
  plus la durée vendue. Un séjour d'une journée quitté après une demi-journée
  reste facturé une journée : seule l'heure de sortie change.
- **Demi-journée et passage** : facturés à l'unité, montant indivisible. Seule
  l'heure de sortie bouge.
- **Montant proposé** : prorata du montant **réglé**
  (`received_amount ?? total_amount`) — `réglé × jours facturés / jours vendus`.
  Il reprend d'office remise négociée, code promo et remise de durée.
- **Montant retenu** : le propriétaire peut retoucher le prorata, entre 0 et le
  montant réglé.
- **Remboursement** : `réglé − retenu`, stocké dans `refunded_amount`. Le
  remboursement Wave d'une réservation en ligne reste manuel.
- **Séjour minimum** : non opposé — le client est déjà parti.
- **Heure de sortie** : après l'entrée, pas dans le futur (tolérance 5 min
  d'horloge), avant la fin prévue.
- **Canaux** : comptoir et en ligne.
- **Réseau requis**, comme la clôture simple : pas de file hors ligne.

## Revirement assumé

`check_out_booking.use_case.ts` refusait de réécrire `end_date` à la clôture :
raccourcir la période sans baisser le montant concentrait le revenu sur moins de
jours et faisait bouger un mois clos. Le départ anticipé réécrit la période
**et** le montant d'un même geste, ce qui garde la répartition mensuelle juste.
Un départ déclaré après la fin d'un mois fait baisser ce mois : c'est le reflet
exact du remboursement consenti.

La vente d'origine est figée dans `planned_check_out_at`, `planned_days_count`
et `planned_total_amount`.

## Contrat

| Route | Corps / requête | Réponse |
|---|---|---|
| `PATCH /{proprio,gerant}/bookings/:id/check-out` | optionnel : `full_stay`, `actual_check_out_at`, `final_amount` | `BookingDto` |
| `GET /{proprio,gerant}/bookings/:id/check-out/preview` | `?at=ISO` (défaut : maintenant) | `actual_check_out_at`, `planned_check_out_at`, `planned_days`, `billed_days`, `paid_amount`, `proposed_amount`, `refund_amount` |

Sans corps, la clôture vaut séjour complet : les versions du mobile déjà
installées restent compatibles.

Nouveaux champs du `BookingDto` : `refunded_amount` (0 par défaut),
`planned_check_out_at`, `planned_days_count`, `planned_total_amount`.
Nouveau champ du relevé Finance : `summary.remboursements`, informatif, déjà
déduit de `ca_brut`, rattaché au jour du départ.

Codes d'erreur : `invalid_departure`, `departure_in_future`,
`not_early_departure`, `invalid_final_amount` (tous 422).
