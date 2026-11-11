# Commission RESI et parrainage récurrent

Décidé le 2026-11-11.

## Commission

- RESI majore le **prix par nuit** du propriétaire dans l'app client et garde
  la différence. Le réglage, unique pour toute la plateforme, se fait au
  backoffice (`/revenus`, bouton « Commission ») : un pourcentage ou un montant
  fixe par nuit. Il est coupé par défaut.
- La majoration s'applique aussi aux paliers de négociation. La remise de
  durée et le départ tardif se calculent sur le prix majoré : la commission
  d'un séjour est l'écart entre le calcul sur la grille du client et celui sur
  la grille du propriétaire (`commission_rules.ts`).
- Les réservations au comptoir ne portent jamais de commission.
- Le **code promo** est pris sur la part de RESI : le propriétaire touche
  toujours son prix.

### Ce qui est figé sur la réservation

`daily_price` … `total_amount` restent la **part du propriétaire**. Son
tableau de bord, ses rapports et son portefeuille n'ont donc pas changé.
S'y ajoutent `commission_mode`, `commission_value`, `commission_amount`,
`client_daily_price`, `client_subtotal_amount` et `client_total_amount`.
Le paiement fige `metadata.owner_amount` : c'est ce montant, et non tout
l'encaissement, qui est crédité au portefeuille.

### Qui voit quoi

- **Propriétaire** : seulement ce qu'il touche. La part de RESI voyage sous une
  clé `Symbol` du DTO, que `JSON.stringify` ignore
  (`booking_commission.ts`).
- **Client** : ses propres prix, sous les mêmes noms de champs
  (`toClientBooking`).
- **Admin** : `commission` sur la vue plateforme d'une réservation.

## Chiffre d'affaires de RESI

`GET /admin/stats/platform-revenue?from&to&granularity=day|week|month`
renvoie les commissions (comptées le jour du paiement, reprises le jour d'un
remboursement), les abonnements, les frais de retrait et, en négatif, les gains
de parrainage. Le calcul se fait à la lecture depuis les collections sources,
sans journal à tenir.

## Parrainage récurrent

Un gain à **chaque** action qui rapporte, et non plus à la première :

- filleul propriétaire : chaque abonnement payé (10 % par défaut) ;
- filleul client : chaque séjour en ligne payé et terminé, **sur la commission
  de RESI** (5 % par défaut). Sans commission, le parrain ne gagne rien.

Chaque gain est un document de `sponsorship_rewards`, sous la clé
`<trigger>_<ref>` qui le rend idempotent. Les gains uniques de l'ancien modèle
(`reward_amount` sur le parrainage, statut `pending`) suivent toujours leur
ancien circuit. Annuler un parrainage reprend tous ses gains et arrête les
suivants.
