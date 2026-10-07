# Mode hors ligne complet — design

**Date :** 2026-10-01
**Périmètre :** `mobile` (Flutter) principalement, `api` pour deux ajouts de
contrat. Le backoffice n'est pas concerné : il n'appelle aucune des routes
touchées.
**Prolonge :** [offlin-desgin.md](../../specs/offlin-desgin.md), dont le
vocabulaire (`source` / `sync_status`) et les arbitrages restent valables.

## Objectif

Le propriétaire paie un abonnement : l'application doit lui rester utile sans
réseau, et pas seulement pour saisir une réservation. Deux exigences :

1. **Tout écran déjà consulté en ligne s'affiche hors ligne**, à l'identique.
2. **Ce qui est saisi hors ligne apparaît aussitôt** dans les affichages
   concernés, sans attendre la synchronisation.

Les actions du comptoir deviennent possibles hors ligne et partent au retour
du réseau. Le reste (biens, résidences, abonnement, gérants, export) demande
une connexion et le dit.

### Critère de réussite

En mode avion, après une session en ligne : l'accueil, les réservations
(liste et fiche), les biens, les clients (liste, fiche, historique), les
dépenses et les résidences s'affichent ; statistiques et finance montrent
leurs derniers chiffres connus. Aucun écran ne reste figé sur un squelette.
Un départ, une prolongation, une fiche client ou une dépense saisis hors
ligne sont visibles immédiatement, marqués « En attente d'envoi ».

## Constat de départ

- La liste et la fiche des réservations n'ont aucun repli local :
  `cached_bookings` ne sert qu'aux disponibilités du formulaire. Même chose
  pour clients (fiche, historique), dépenses, résidences, statistiques,
  finance : `ErrorState` hors réseau.
- `PropertyCubit` se replie sur `cached_properties`, mais ce cache ne garde
  que l'identifiant, le titre, le tarif et le rattachement : les cartes de
  l'onglet Biens perdent photo, adresse et statut (affiché « Brouillon »).
- Wi-Fi connecté sans Internet : `connectivity_plus` annonce une connexion,
  la requête attend 15 s puis `RetryInterceptor` la rejoue trois fois. Le
  squelette reste près d'une minute avant le repli.
- `AuthInterceptor` purge la session sur **tout** échec du rafraîchissement
  de jeton, y compris une simple coupure réseau.
- Seule la création de réservation est mise en file.

## Décisions

| Sujet | Décision |
|---|---|
| Lecture hors ligne | Cache HTTP des réponses `GET`, réseau d'abord |
| Couverture du cache | Préchargement en tâche de fond, en plus des lectures ordinaires |
| Saisies visibles avant envoi | Superposition de la file sur les réponses lues |
| Écritures hors ligne | Actions du comptoir uniquement, file d'actions générale |
| Tables de saisie existantes | Conservées (`cached_*`, `pending_bookings`, `pending_clients`) |
| Finance et tableau de bord | Derniers chiffres serveur, sans recalcul local |
| Départ anticipé hors ligne | Prorata calculé sur l'appareil, montant envoyé explicitement |
| Idempotence des dépenses | `client_request_id`, ajouté côté API |
| Heure d'un départ complet rejoué | `actual_check_out_at` accepté côté API |

## Lecture hors ligne

### `OfflineCacheInterceptor`

Nouveau dossier `lib/core/offline/`. L'intercepteur s'insère dans Dio **en
tête**, avant connectivité, authentification et rejeu, et ne traite que les
`GET` :

- **Appareil hors ligne** (connectivité `none`) : réponse immédiate depuis le
  cache, sans tentative réseau.
- **Sinon** : la requête part avec un délai réduit à 8 s et sans rejeu sur
  échec réseau (`extra['no_retry']`). Un succès 2xx écrit le corps JSON dans
  le cache ; un échec réseau (timeout, `connectionError`, 5xx) se rabat sur
  le cache. Un 4xx n'est jamais masqué par le cache : c'est une réponse du
  serveur, pas une panne.
- Une réponse servie depuis le cache porte
  `extra['offline'] = { cached_at }` et le code 200. Les repositories la
  parsent comme une autre.
- Pas de cache pour une requête jamais réussie : l'échec remonte tel quel,
  avec un `AppFailure` dont le `userMessage` est « Non disponible hors
  ligne — à consulter une fois connecté » (`statusCode` nul, type
  `offline_unavailable`).

Exclusions : routes d'authentification, `subscription/checkout`,
`subscription/confirm`, aperçu du départ anticipé (`check-out/preview`) — une
estimation datée n'a pas de sens rejouée depuis le cache.

### Table `http_cache` (schéma local v5)

```
http_cache
  cache_key     TEXT PRIMARY KEY   sha1(user_id | role | path | query triée)
  path          TEXT               pour la purge ciblée et le débogage
  body          TEXT               JSON brut de la réponse
  cached_at     INTEGER            epoch ms
```

La clé inclut l'utilisateur et le rôle : un gérant ne lit jamais le cache
d'un propriétaire, même sur le même appareil. La table est une table de
cache : `clearCaches()` la vide (session expirée), `clear()` aussi
(déconnexion). Pas de durée de vie : une donnée ancienne vaut mieux que pas
de donnée, et la date est affichée.

### Signal « hors ligne »

`OfflineStatus` (singleton, `ValueNotifier`) retient la plus ancienne date de
cache servie depuis le dernier succès réseau, et repasse à `null` au premier
`GET` réussi. Un bandeau unique, sous l'en-tête de l'accueil et des écrans
empilés, affiche « Hors ligne · données du 01/10 à 14:32 ». Il rejoint le
`SyncStatusBanner` existant, qui compte la file.

### Préchargement — `OfflinePrefetcher`

Lancé à l'ouverture de l'accueil en ligne et à chaque retour du réseau, après
la synchronisation (la file d'abord, pour précharger un état à jour). En
série, en tâche de fond, interrompu à la première panne réseau. Il passe par
les repositories, donc par l'intercepteur : rien de spécial à écrire pour le
stockage.

| Données | Requêtes |
|---|---|
| Biens | toutes les pages, puis la fiche de chaque bien |
| Résidences | toutes les pages, puis chaque fiche |
| Réservations | non terminées (toutes) + 90 jours d'historique, et chaque fiche |
| Clients | carnet complet (toutes les pages) |
| Dépenses | mois en cours et précédent, liste et résumé |
| Indicateurs | statistiques de l'accueil, tableau de bord, finance du mois |

Les photos passent déjà par `CachedNetworkImage` : une photo vue en ligne se
revoit hors ligne. Elles ne sont pas préchargées — le forfait de données du
propriétaire ne doit pas payer des images qu'il n'a pas regardées.

Le préchargement emprunte les **mêmes paramètres** que les écrans (`per_page`,
filtres) : une clé de cache ne sert que si l'écran la redemande à
l'identique. Les listes filtrées hors ligne (réservations par statut,
recherche de dépenses) sont recalculées en mémoire depuis la liste complète
en cache quand leur propre clé manque — comme la recherche locale de
l'onglet Biens.

### Tables de saisie existantes

`cached_properties`, `cached_clients` et `cached_bookings` restent : ils
servent des recherches locales (client par téléphone, disponibilités par
bien) que le cache HTTP ne sait pas faire. `PropertyCubit` cesse en revanche
de reconstruire ses cartes depuis `cached_properties` : la liste complète lui
vient désormais du cache HTTP, photo et statut compris.

## Saisies visibles avant envoi — `PendingOverlay`

Entre le JSON lu (réseau ou cache) et le cubit, les repositories concernés
appliquent les actions encore en file. La superposition vit dans
`lib/core/offline/pending_overlay.dart`, fonctions pures testables.

| Affichage | Effet |
|---|---|
| Liste des réservations | réservation créée ajoutée en tête ; départ, prolongation, modification appliqués à la ligne |
| Fiche réservation | même chose, plus la mention de l'action en attente |
| Carnet et fiche client | client créé ou modifié |
| Dépenses | dépense ajoutée, total du résumé recalculé |
| Accueil (en cours, à venir) | compteurs ajustés par les réservations et départs en file |
| Disponibilités | inchangé, déjà le cas |

Un élément touché localement porte un badge : « En attente d'envoi » (ambre,
en attente d'action) ou « Conflit » (rouge, arrêté par une décision), dans la
grammaire `StatusTones`.

**Finance et tableau de bord** gardent les derniers chiffres serveur, avec la
mention « N opérations en attente non comptées ». Recalculer le revenu au
prorata et le taux d'occupation sur l'appareil recopierait la logique
financière du serveur, avec le risque de deux chiffres différents pour un
même mois.

## Écritures du comptoir

### File d'actions — `pending_actions` (schéma local v5)

```
pending_actions
  id              TEXT PRIMARY KEY   UUID v4, sert aussi d'idempotence
  type            TEXT               voir tableau ci-dessous
  target_ref      TEXT NULL          identifiant serveur ou `local-<uuid>`
  payload         TEXT               JSON du corps à envoyer
  file_paths      TEXT NULL          JSON, pièces d'identité
  created_at      INTEGER            ordre de vidage
  state           TEXT               'pending' | 'conflict' | 'rejected'
  error_code      TEXT NULL
  error_message   TEXT NULL

local_refs
  local_id        TEXT PRIMARY KEY   `local-<uuid>`
  remote_id       TEXT
```

`pending_bookings` et `pending_clients` restent en place : ils portent de
l'argent encaissé, et les fondre dans la nouvelle table imposerait de migrer
des files non vides sur des appareils en service. `SyncService` vide les
trois sources ensemble, **en série, par `created_at`**. `local_refs`
généralise `linkClientRemoteId` : une réservation ou une fiche créée hors
ligne reçoit `local-<uuid>`, et toute action qui la vise se résout à l'envoi.
Une action dont la cible n'est pas encore partie (en attente, en conflit ou
refusée) reste bloquée derrière elle, sans partir.

### Actions

| `type` | Hors ligne, à l'écran | Au rejeu |
|---|---|---|
| `booking_check_out` | sortie = instant de la saisie | `booking_already_completed` vaut succès |
| `booking_check_out_early` | prorata calculé sur l'appareil, libellé « estimation » | `final_amount` envoyé explicitement |
| `booking_extend` | prolongation affichée aussitôt | 409 → `conflict` |
| `booking_update` | modification affichée aussitôt | 409 → `conflict` |
| `client_create` | fiche visible, pièces comprises | `client_phone_exists` → fiche existante réutilisée, `local_refs` renseigné |
| `client_update` | fiche modifiée | ordinaire |
| `expense_create` | dépense visible | idempotente par `client_request_id` |

Le départ anticipé hors ligne reprend `quoteEarlyCheckOut` du serveur
(`api/app/features/bookings/early_check_out.ts`) dans
`lib/features/reservation/business_logic/early_check_out_quote.dart`, comme
`StayQuote` reprend la tarification : jour entamé dû, prorata sur le montant
réglé, demi-journée et passage indivisibles. Le montant retenu part en
`final_amount` : le serveur ne recalcule pas un autre chiffre que celui
annoncé au client.

Les cubits concernés (`StayCheckOutCubit`, `EarlyCheckOutCubit`,
`StayExtensionCubit`, `EditReservationCubit`, `AddClientCubit`,
`AddExpenseCubit`, `ClientDetailCubit.save`) suivent le modèle
d'`AddReservationCubit` : envoi direct en ligne, mise en file sur échec
**réseau** seulement, succès marqué `queued` pour annoncer l'envoi différé. Un
refus métier remonte toujours au propriétaire. Une action sur un élément
encore local (`local-…`) part directement en file, sans tentative réseau.

Les codes d'action s'écrivent avec des tirets bas : une forme pointée
(`expense.create`) se confondrait avec une clé de traduction.

Pas de contrôle de chevauchement local pour la prolongation et la
modification : le serveur reste l'autorité, et un 409 à l'envoi devient un
conflit à arbitrer.

### Erreurs au rejeu

| Réponse | Traitement |
|---|---|
| Panne réseau, 5xx | reste `pending`, retenté au prochain retour du réseau ; la file s'arrête là |
| 409 métier | `conflict`, conservé, jamais supprimé |
| Autre 4xx | `rejected`, avec `code` et message de l'API |
| 401 | arrêt sans purge ; la file attend la reconnexion |

Les éléments `conflict` et `rejected` remontent dans un écran **« À
arbitrer »**, ouvert depuis le bandeau de synchro. Deux issues par élément :
« Renvoyer » (remise en file et envoi immédiat, après que le propriétaire a
libéré la période par exemple) ou « Abandonner », après une confirmation qui
rappelle le montant en jeu. Aucune résolution
automatique, comme pour les réservations.

## Actions bloquées hors ligne

Création et modification de biens et de résidences, publication, photos,
abonnement, gérants, export de rapport, retours. Le bouton reste actif ; à
l'appui hors réseau, la garde `ensureOnline` affiche « Nécessite une
connexion » au lieu d'ouvrir un formulaire voué à l'échec. Un Wi-Fi sans
Internet passe la garde : l'envoi échoue alors avec le message réseau
habituel.

## Correctifs inclus

- `RetryInterceptor` ne rejoue plus une requête marquée `no_retry` ni un
  refus de l'intercepteur de connectivité, et ses rejeux passent par le
  client Dio configuré (délais compris) au lieu d'un `Dio()` nu.
- `AuthInterceptor` ne purge la session que sur un refus du serveur au
  rafraîchissement — une réponse 4xx (`invalid_refresh`, `expired_refresh`
  en 401, validation en 422). Un échec réseau pendant le rafraîchissement
  laisse les jetons en place et remonte l'erreur réseau.

## Contrats d'API

Deux ajouts, rétrocompatibles, sur les routes `proprio` **et** `gerant` (même
use case). Seul le mobile est concerné.

### `PATCH /bookings/:id/check-out` — heure du départ complet

`actual_check_out_at` est déjà accepté pour `full_stay: false`. Il le devient
pour un départ complet : sans lui, un départ saisi à 11 h et synchronisé à
18 h serait consigné à 18 h. Mêmes garde-fous que le départ anticipé :
postérieur à l'entrée, pas dans le futur au-delà de
`CLOCK_SKEW_TOLERANCE_MS`. Absent, le comportement actuel (`now`) est
conservé. `completed_at` reste l'heure serveur de l'écriture.

### `POST /expenses` — idempotence

`client_request_id` (UUID, optionnel) rejoint `createExpenseValidator` et le
modèle `expense`. Comme pour les réservations comptoir, la dépense est écrite
sous un **identifiant dérivé** (`sha256(expense:owner_id:client_request_id)`),
dans une transaction : un rejeu rend la dépense déjà écrite sans en créer une
seconde, et aucun index n'est nécessaire. Le rejeu est vérifié avant le
contrôle de la cible — un bien supprimé depuis la saisie ne doit pas bloquer
la file sur une dépense pourtant enregistrée. Un identifiant réemployé par un
autre auteur (`created_by` différent) est refusé en 409
`client_request_id_reused`. Les dépenses existantes n'ont pas le champ : il se
lit optionnel.

## Découpage

### API

```
app/validators/booking/booking.ts             actual_check_out_at et full_stay
app/features/bookings/use_cases/check_out_booking.use_case.ts
app/models/expense.ts                         client_request_id?
app/validators/expense/*.ts                   client_request_id optionnel
app/features/expenses/use_cases/create_expense.use_case.ts
app/features/expenses/repositories/*          findByRequestId, createOnce
```

### Mobile

```
lib/core/offline/
  offline_cache_interceptor.dart
  http_cache_store.dart
  offline_status.dart
  offline_prefetcher.dart
  pending_overlay.dart
  pending_action.dart                 modèle + types
  pending_action_store.dart
lib/core/storage/app_database.dart    v5 : http_cache, pending_actions, local_refs
lib/core/sync/sync_service.dart       trois sources, local_refs, erreurs
lib/core/api/api_client.dart          ordre des intercepteurs
lib/core/api/interceptors/{retry,auth}_interceptor.dart
lib/shared/widgets/offline_banner.dart
lib/features/reservation/…            cubits d'action, quote, overlay, écran « À arbitrer »
lib/features/clients/…                cubits d'ajout / édition
lib/features/expense/…                cubit d'ajout
lib/features/property/…               cubit sans reconstruction minimale
assets/translations/{fr,en}.json
```

## Tests

API (Japa) :

- `check_out` complet avec `actual_check_out_at` : heure consignée, refus
  d'une heure future ou antérieure à l'entrée, comportement inchangé sans le
  champ.
- Idempotence des dépenses : deux créations au même `client_request_id`
  produisent une seule dépense.

Mobile (`flutter test`) :

- Clé de cache : stable à l'ordre des paramètres près, distincte par
  utilisateur et rôle.
- Intercepteur : hors ligne → cache ; échec réseau → cache ; 4xx jamais
  masqué ; absence de cache → `offline_unavailable`.
- `PendingOverlay` : chaque type d'action sur liste et fiche, total des
  dépenses.
- Portage du prorata de départ anticipé, sur les cas du serveur.
- `SyncService` : ordre par `created_at` entre les trois sources, résolution
  de `local-…`, action bloquée derrière une cible en échec, classement
  `pending` / `conflict` / `rejected`, arrêt sans purge sur 401.
- Migration v4 → v5 sans perte des files existantes.

## Hors périmètre

- Biens, résidences, photos, publication, abonnement, gérants, export de
  rapport, retours hors ligne.
- Recalcul local de la finance et du tableau de bord.
- Annulation d'une réservation hors ligne : elle n'est pas proposée
  aujourd'hui par le mobile.
- Durée de vie du cache et purge par ancienneté.
