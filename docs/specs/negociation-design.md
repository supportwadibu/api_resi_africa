# Négociation

Pas de discussion entre client et propriétaire : le propriétaire règle à
l'avance des **paliers** de prix par jour, et le client les découvre un à un.

## Côté propriétaire

Sur chaque logement, `negotiation: { enabled, prices }` (création et
`PATCH /proprio/properties/:id`, remplacée en entier). `prices` : au plus
`MAX_NEGOTIATION_STEPS` (5) paliers, strictement décroissants, tous sous le
prix normal — sans quoi on « négocierait » à la hausse. `normalizeNegotiation`
refuse sinon (`invalid_negotiation`, 422).

Le champ vit **hors de `pricing`** : la vue publique recopie `pricing`, et les
paliers ne doivent jamais en sortir. Le client irait droit au plancher.

## Côté client

Toutes les fiches portent « Négocier » et « Réserver » : rien n'annonce d'avance
qu'un logement se négocie, sinon chacun négocierait.

| Route (client connecté) | Effet |
|---|---|
| `GET /client/properties/:id/negotiation` | Paliers déjà révélés |
| `POST /client/properties/:id/negotiation/next` | Révèle le suivant |

Réponse : `{ status, daily_price, offers: [{ level, daily_price }] }`, toujours
200.

- `not_negotiable` : négociation coupée, ou aucun palier encore sous le prix
  normal. L'app l'annonce dans une feuille.
- `offer` : le dernier de `offers` vient d'être proposé.
- `exhausted` : plus rien à révéler. Le client choisit une offre vue ou le prix
  normal.

Le nombre de paliers restants n'est jamais dit.

Les paliers révélés sont mémorisés par couple bien–client
(`negotiations/{propertyId}_{clientId}`) pendant `NEGOTIATION_VALIDITY_DAYS`
(7 jours, relancés à chaque palier). Rouvrir la fiche ne repart donc pas du
premier. Ils sont figés : retoucher la grille ne reprend pas une offre faite.
Couper la négociation, si.

## Réservation au prix négocié

`POST /client/properties/:id/bookings` avec `negotiation_level`. Le prix est
relu dans la négociation du client, jamais pris de la requête ; un palier non
révélé, échu ou un bien plus négociable rend `negotiation_offer_unavailable`
(409).

- **Prix final** : il remplace `daily_price`, sans remise de durée
  (`negotiatedPricing`). Bornes de durée et départ tardif restent ceux du bien.
- Pas de code promo avec un prix négocié (`promo_not_with_negotiation`, 422).
- La réservation garde `negotiation_level` et `list_daily_price` (le prix normal
  d'alors). Une prolongation reste au prix négocié.
