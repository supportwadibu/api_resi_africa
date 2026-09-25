# API d'administration — back-office

Routes consommées par le back-office Next.js, sous `/api/v1/admin`, toutes
gardées par `auth()` puis `role(['admin'])`. Les listes paginées répondent
`{ data, meta: { total, perPage, currentPage, lastPage } }` (`per_page` ≤ 100),
les lectures unitaires `{ data }`, les erreurs `{ code, message }`.

## Routes

| Méthode | Chemin | Rôle |
|---|---|---|
| GET | `stats` | Tableau de bord : comptes, propriétaires, catalogue, réservations, revenu du mois, occupation, abonnements, retours |
| GET | `stats/revenue?months=12` | Série mensuelle du revenu (1 à 24 mois) |
| GET | `users?role&is_active&q&page&per_page` | Comptes, tous rôles |
| POST | `users` | Création, tous rôles : `role`, `full_name`, `email` et/ou `phone`, `password` initial ; `owner_id` pour un `gerant`. Compte vérifié d'office, réponse `201 { data }` |
| GET | `users/:id` | Fiche : sessions actives, bloc `owner` (proprio), `manager_assignment` (gérant) |
| PATCH | `users/:id` | `full_name`, `email`, `phone`, `is_active` |
| GET | `owners?status` · `owners/pending` | Propriétaires par statut de validation |
| GET | `owners/:id` | Propriétaire |
| GET | `owners/:id/profile` | Dossier de validation, pièces en URLs signées |
| GET | `owners/:id/portfolio` | Résidences avec leurs unités, puis logements autonomes |
| POST | `owners/:id/validate` | Valide le compte (ouvre l'essai s'il manque) |
| POST | `owners/:id/reject` | Rejette, `reason` obligatoire |
| GET | `properties?owner_id&residence_id&status&property_type` | Logements, avec `owner` et `residence` |
| GET | `properties/:id` | Logement |
| GET | `properties/:id/clients` | Clients ayant réservé ce logement |
| GET | `residences?owner_id` | Résidences, avec `owner` et `units` |
| GET | `residences/:id` | Résidence et ses unités |
| GET | `bookings?owner_id&property_id&client_id&status` | Réservations, avec `property`, `residence`, `owner`, `client` |
| GET | `bookings/:id` | Réservation |
| GET | `subscriptions?status&user_id&is_trial` | Abonnements |
| PATCH | `subscriptions/:id/cancel` | Annule, `reason` facultative |
| GET · POST | `promo-codes` | Codes promo (liste complète, non paginée) · création |
| PATCH · DELETE | `promo-codes/:id` | Modification (le code est immuable) · suppression d'un code jamais utilisé |

`plans` et `feedbacks` préexistaient et ne changent pas.

## Logements et résidences

Un logement est l'unité louable ; une résidence regroupe un ou plusieurs
logements et ne se loue jamais ; un logement peut n'appartenir à aucune
résidence. Mêler les deux natures dans une seule liste paginée obligerait à
paginer deux collections Firestore à la fois, ce qu'aucune requête n'exprime.
Trois lectures complémentaires à la place :

- **`properties`** — la liste plate, pour filtrer et chercher. Chaque ligne
  porte `residence: { id, name, city } | null`. `null` avec un `residence_id`
  renseigné signale un rattachement orphelin (résidence supprimée).
- **`residences`** — chaque résidence porte `units[]`. Une résidence vide est
  rendue avec zéro unité ; `units_count` y est recompté sur les unités lues,
  pas repris du compteur dénormalisé.
- **`owners/:id/portfolio`** — l'arbre complet d'un propriétaire :
  `residences[].units[]` puis `standalone[]`, où tombent aussi les logements
  orphelins pour ne jamais disparaître de l'écran.

## Clients d'un logement

Aucun client n'est rattaché à un logement : le carnet l'est au propriétaire,
les comptes à personne. La liste est donc **dérivée des réservations** du
logement, regroupées par client :

- `kind: 'carnet'` — fiche du carnet, réservation `offline` ;
- `kind: 'account'` — compte de l'application, réservation `online` (ou sans
  `source`, l'historique antérieur au comptoir).

Le nom vient de l'instantané `client_snapshot` le plus récent, à défaut du
compte ou de la fiche actuels. `stats` suit la règle du carnet (annulations
exclues, `received_amount` prioritaire) ; `bookings_count` compte tout.
Non paginée : un agrégat calculé sur une page serait faux.

## Codes d'erreur ajoutés

| Code | Statut | Cas |
|---|---|---|
| `user_not_found` | 404 | Compte introuvable |
| `cannot_deactivate_self` | 409 | Un administrateur désactive son propre compte |
| `email_already_used` · `phone_already_used` | 409 | Identifiant porté par un autre compte |
| `user_contact_required` | 422 | Création sans e-mail ni téléphone |
| `admin_email_required` | 422 | Création d'un admin sans e-mail — il se connecte par e-mail |
| `owner_not_found` | 422 | Création d'un gérant sans propriétaire valide |
| `account_already_exists` | 409 | Doublon apparu entre le contrôle et l'écriture |
| `property_not_found` · `residence_not_found` · `booking_not_found` | 404 | Ressource introuvable |
| `promo_code_not_found` | 404 | Code introuvable |
| `promo_code_already_exists` | 409 | Code déjà créé |
| `promo_code_in_use` | 409 | Suppression d'un code déjà utilisé — le désactiver |
| `invalid_promo_value` | 422 | Pourcentage supérieur à 100 |
| `invalid_promo_period` | 422 | Expiration antérieure au début |

## Limites connues

- La recherche `q` sur les comptes se fait après lecture, sur au plus
  `SCOPE_READ_LIMIT` (1 000) comptes répondant aux autres filtres.
- `properties/:id/clients` et `owners/:id/portfolio` lisent au plus 1 000
  documents.
- Les filtres des listes plateforme se limitent aux égalités couvertes par
  `firestore.indexes.json` : les index ajoutés doivent être déployés
  (`firebase deploy --only firestore:indexes`) avant la mise en service.
- `feedbacks.new` des statistiques ignore les tout premiers retours, sans
  champ `status`.
