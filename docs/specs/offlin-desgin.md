# Réservations comptoir et carnet clients — design

**Date :** 2026-08-21
**Périmètre :** `api_resi` (AdonisJS + Firestore) et `resi_africa` (Flutter)

## Objectif

Permettre au propriétaire d'enregistrer lui-même une réservation depuis
l'application : soit un check-in immédiat, soit une réservation future. Le
client est enregistré dans un carnet d'adresses (nom, téléphone, pièce
d'identité recto/verso) ou sélectionné parmi les clients déjà connus. La
saisie doit rester possible sans connexion Internet, la synchronisation se
faisant au retour du réseau.

Deux corrections de fond accompagnent la fonctionnalité, parce que la
réservation comptoir les rend inévitables : la répartition du revenu d'un
séjour à cheval sur deux mois, et le calcul de la disponibilité d'un bien.

## Vocabulaire

Le mot « offline » recouvre deux notions distinctes, séparées dans tout ce
document et dans le code :

- **Canal de vente** (`source`) : `offline` désigne une réservation prise au
  comptoir, par opposition à `online`, prise par un client via l'application.
  Cette valeur ne change jamais.
- **État de synchronisation** (`sync_status`) : indique si une réservation
  saisie sans réseau est parvenue au serveur. Transitoire.

Une réservation comptoir synchronisée reste `source: offline`.

## Décisions

| Sujet | Décision |
|---|---|
| Modèle client | Collection `clients` dédiée, scoppée par `owner_id` |
| Identification client | Le téléphone, avec dédoublonnage assisté |
| Pièces d'identité | Facultatives, avec statut de complétude et relance |
| Tarification demi-journée / passage | Dérivée automatiquement de `daily_price` |
| Revenu d'un séjour à cheval | Prorata temporis |
| Disponibilité d'un bien | Calculée sur chevauchement de dates |
| Mode hors-ligne | File de synchro locale, conflits signalés au propriétaire |
| Stockage local | SQLite (`sqflite`) |

## Modèle de données

### Collection `clients` (nouvelle)

```
clients/{id}
  owner_id                       string    le carnet appartient au propriétaire
  full_name                      string
  phone                          string
  whatsapp                       string | null
  id_document_type               'cni' | 'passeport' | 'permis' | null
  id_document_number             string | null
  id_document_front_public_id    string | null    Cloudinary privé
  id_document_back_public_id     string | null
  documents_status               'complete' | 'pending'
  stats: { total_stays, total_paid, last_stay_at }
  status                         'active' | 'archived'
  created_at, updated_at
```

L'unicité de `(owner_id, phone)` est vérifiée applicativement : Firestore n'a
pas d'index unique, et c'est déjà le parti pris de `User.create`. La
contrainte est par propriétaire — deux propriétaires peuvent avoir le même
client dans leur carnet, chacun avec sa fiche. Un propriétaire ne doit jamais
pouvoir constater l'existence des clients d'un autre.

Les `*_public_id` référencent des ressources Cloudinary privées, jamais des
URLs : une URL signée expire, la persister produirait des liens morts. La
lecture régénère l'URL à chaque fois, via `document_storage.ts`.

### Collection `bookings` (champs ajoutés)

Tous les champs sont additifs. Aucun document existant n'est invalidé, aucune
migration n'est nécessaire.

```
  source              'online' | 'offline'          défaut 'online'
  client_id           -> clients/{id} si offline, users/{id} si online
  client_snapshot     { full_name, phone } | null
  stay_type           'passage' | 'half_day' | 'full_day'
  check_in_at         Date
  check_out_at        Date
  expected_amount     number    calculé depuis la grille du bien
  received_amount     number    négocié, saisi par le propriétaire
  deposit_amount      number    acompte
  client_request_id   string | null    UUID d'idempotence
  sync_status         'synced' | 'pending' | 'conflict'
```

`client_snapshot` fige le nom et le téléphone au moment de la réservation. Une
fiche client renommée ou archivée ne doit pas réécrire l'historique — c'est la
même logique que `daily_price`, déjà figé à la réservation.

`client_id` pointe vers deux collections différentes selon `source`. La
lecture doit donc toujours consulter `source` avant de résoudre la référence.

`check_in_at` et `check_out_at` doublent les `start_date` et `end_date`
existants, avec une précision à l'heure que ces derniers n'ont pas toujours.
Pour éviter deux sources de vérité, les deux couples sont écrits ensemble et
tenus identiques à la création : `start_date = check_in_at` et
`end_date = check_out_at`. Les champs d'origine restent la source pour Finance
et les écrans existants ; les nouveaux portent l'horaire affiché. Toute
écriture qui modifie l'un modifie l'autre dans la même opération.

### Statut de réservation

Le statut `in_progress` s'ajoute aux trois existants :

```
'confirmed' | 'in_progress' | 'completed' | 'cancelled'
```

Un check-in crée directement une réservation `in_progress`. Une réservation
future naît `confirmed` et passe `in_progress` à l'entrée effective.

### Tarification

`PropertyPricing` n'est pas modifié. Les deux tarifs manquants sont dérivés au
calcul, dans `stay_pricing.ts` :

```
half_day_price = round(daily_price * 0.5)
passage_price  = round(daily_price * 0.3)
```

Aucune migration, et tous les biens existants acceptent immédiatement les trois
types de séjour. Ces ratios sont des constantes nommées, remplaçables plus tard
par des champs surchargeables sans rien casser — les champs seraient optionnels
et le calcul retomberait sur le dérivé.

`minimum_stay_days` ne s'applique qu'au séjour complet : il vaut 1 par défaut,
et l'y soumettre rendrait la demi-journée impossible sur tout bien existant.

### Durées par type de séjour

| Type | Durée | Décompte facturé |
|---|---|---|
| `full_day` | 24 h, 12h → 12h par défaut | 1 jour par tranche |
| `half_day` | 12 h | 0,5 jour |
| `passage` | infra-journalier, sortie saisie | 0,25 jour |

`days_count` reste alimenté (minimum 1) pour ne pas casser Finance ni
l'affichage existant. `stay_type` porte la vérité métier.

Le décompte fractionnaire ne sert **qu'au dénominateur du taux d'occupation** :
une demi-journée n'immobilise pas le bien autant qu'un séjour complet, et la
compter pour 1 gonflerait artificiellement le taux. Il n'intervient jamais
dans la facturation ni dans la répartition du revenu, où le montant reste
entier et indivisible.

## Disponibilité d'un bien

### Problème actuel

`createWithPropertyReservation` écrit `status: 'reserved'` et
`visibility.is_public: false` sur le bien. Trois défauts :

1. Une réservation pour dans trois mois rend le bien invendable dès
   aujourd'hui.
2. Rien ne remet jamais le bien en `published` — ni l'annulation, ni la fin
   du séjour. Le bien reste bloqué indéfiniment. C'est un bug existant.
3. Deux séjours qui ne se chevauchent pas se bloquent mutuellement.

### Règle retenue

Un bien est indisponible sur une période s'il existe une réservation active
qui chevauche cette période.

```
chevauchement ⟺ nouvelle.check_in_at  <  existante.check_out_at
              ET nouvelle.check_out_at >  existante.check_in_at
```

Les bornes sont strictes : un départ à 12h et une arrivée à 12h le même jour
ne se chevauchent pas. C'est ce qui rend possible l'enchaînement de deux
séjours dans la même journée, conformément à la règle 12h → 12h.

Les réservations `cancelled` sont ignorées. Les `completed` le sont aussi :
leur période est passée, elle ne peut chevaucher aucune réservation à venir.

Une réservation future n'a donc **aucun effet immédiat** sur la vente du bien :
elle réserve sa période et rien d'autre. Un bien réservé pour Noël reste
vendable jusqu'en décembre, sauf sur les dates retenues.

Le bien redevient disponible de lui-même à la fin du séjour, sans action ni
tâche planifiée : la disponibilité étant déduite des dates, il n'y a aucun
état à remettre à zéro. C'est ce qui corrige le bien bloqué indéfiniment.

`status` retrouve son seul rôle légitime — la publication (`draft`,
`published`, `archived`), décidée par le propriétaire. `reserved` cesse d'être
écrit. Le champ reste dans le modèle et dans `PROPERTY_STATUSES` : des
documents le portent déjà, et `statsByOwner` s'appuie dessus.

### Contrainte Firestore

Firestore n'accepte qu'un seul champ en inégalité par requête, or le
chevauchement en exige deux. La requête filtre donc sur
`check_out_at > <borne basse>` avec `property_id` en égalité, et le
chevauchement exact est évalué en mémoire. Le volume concerné — les
réservations non terminées d'un seul bien — rend le compromis sans incidence.
`findForRevenue` documente déjà le même arbitrage.

## Répartition du revenu

### Problème actuel

`revenuePoints` rattache le montant d'un séjour à son mois de début. Un séjour
du 28 octobre au 3 novembre place 100 % du montant sur octobre.

`findForRevenue` retient les séjours qui chevauchent la fenêtre, puis
`stayDays` compte les jours entiers du séjour. Octobre se voit donc attribuer
6 jours d'occupation là où 4 lui reviennent. Le taux d'occupation peut
dépasser 100 %, ce que masque aujourd'hui un plafonnement à 1.

Les deux indicateurs sont donc incohérents entre eux : le revenu ne découpe
pas, l'occupation déborde.

### Règle retenue

Le revenu et les jours d'occupation sont répartis au prorata des jours
effectivement passés dans chaque mois.

```
splitRevenueByMonth(booking) -> [{ year, month, days, amount }]
```

Exemple — 28 octobre au 3 novembre, 60 000 F, 6 jours :

| Mois | Jours | Montant |
|---|---|---|
| Octobre | 4 | 40 000 F |
| Novembre | 2 | 20 000 F |

Trois invariants, à couvrir par des tests :

1. La somme des tranches égale exactement le montant total. Le reste
   d'arrondi est imputé à la dernière tranche — le FCFA n'a pas de
   subdivision, et une division en trois produirait sinon une perte de francs.
2. Le taux d'occupation ne compte que les jours tombant dans la fenêtre
   demandée.
3. Un `passage` ou une `half_day` compte pour une fraction de jour dans
   l'occupation, mais son montant reste entier et non divisé.

Le revenu réparti est le **revenu constaté**, qui répond à « ce bien a-t-il
été rentable en octobre ». Il ne se confond pas avec l'encaissement
(`deposit_amount`, `received_amount`), qui répond à « combien ai-je reçu » et
alimentera une vue trésorerie distincte.

## Mode hors-ligne

### Caches locaux

Quatre tables SQLite, alimentées à chaque lecture réussie du serveur :

| Table | Contenu | Rôle |
|---|---|---|
| `cached_properties` | biens du propriétaire | remplir le sélecteur de résidence sans réseau |
| `cached_clients` | carnet clients | bottomsheet et dédoublonnage par téléphone |
| `cached_bookings` | réservations connues | consultation et détection locale de chevauchement |
| `pending_bookings` | file de synchronisation | réservations saisies, pas encore parties |

Sans `cached_properties`, le formulaire hors-ligne n'a aucune résidence à
proposer : le cache des biens est un prérequis de la saisie, pas un confort.

### Cycle d'une réservation saisie sans réseau

1. Un `client_request_id` (UUID v4) est généré sur l'appareil à la saisie.
2. La réservation est écrite dans `pending_bookings`, **dans la même
   transaction SQLite** que la création du client si celui-ci est nouveau. Un
   plantage entre les deux écritures laisserait sinon une réservation
   orpheline pointant vers un client inexistant.
3. L'application vérifie le chevauchement localement, sur `cached_bookings` et
   `pending_bookings`, et refuse immédiatement un double-booking évident. Ce
   contrôle est un confort d'ergonomie, jamais une garantie : le cache peut
   être périmé, le serveur reste l'autorité.
4. Au retour du réseau, le service de synchronisation vide la file **en
   série**, par ordre de saisie. Deux réservations sur le même bien doivent
   s'ordonner ; les envoyer en parallèle rendrait l'issue indéterminée.
5. Chaque succès bascule la ligne en `synced` et rafraîchit les caches.

Les fichiers de pièce d'identité restent sur l'appareil, leur chemin stocké en
base, et partent en multipart au moment de la synchronisation. Une pièce
photographiée sans réseau n'est jamais perdue.

### Idempotence

Le `client_request_id` accompagne la requête de création. Le serveur le
persiste et, avant toute création, vérifie qu'aucune réservation ne le porte
déjà. Le cas échéant il retourne la réservation existante avec un `200`, sans
en créer une seconde.

Sans ce mécanisme, un timeout suivi d'un retry — situation ordinaire sur
réseau instable — crée deux réservations pour un seul client et fausse la
comptabilité de façon invisible.

### Conflits

Si le serveur répond `booking_period_conflict`, la réservation passe en
`sync_status: 'conflict'` et **n'est jamais supprimée**. Elle remonte dans un
écran dédié où le propriétaire voit les deux réservations en regard et
tranche : réattribuer à un autre bien, ou annuler.

Aucune résolution automatique. Le système ne peut pas savoir lequel des deux
clients occupe effectivement le logement, et deviner reviendrait à effacer une
réservation payée.

## Contrats d'API

Toutes les routes sont sous `/api/v1/proprio`, derrière
`middleware.auth()` et `middleware.role(['proprio'])`.

```
GET    /clients                  liste et recherche (?q=, ?status=, ?page=)
POST   /clients                  création (multipart : CNI recto/verso)
GET    /clients/:id              fiche, avec URLs signées des pièces
PATCH  /clients/:id              mise à jour
POST   /clients/lookup           dédoublonnage par téléphone

POST   /bookings                 création (idempotente)
GET    /bookings                 liste existante, enrichie du client
GET    /bookings/:id             détail
PATCH  /bookings/:id/check-out   clôture du séjour
GET    /properties/availability  périodes occupées (?property_id=, ?from=, ?to=)
```

### Codes d'erreur

| Code | HTTP | Sens |
|---|---|---|
| `booking_period_conflict` | 409 | la période chevauche une réservation existante |
| `client_phone_exists` | 200 | numéro déjà connu ; la fiche est retournée pour réutilisation |
| `invalid_stay_dates` | 422 | sortie antérieure ou égale à l'entrée |
| `minimum_stay_not_reached` | 422 | existant, séjour complet uniquement |
| `stay_not_started` | 422 | clôture d'un séjour dont l'entrée est à venir : l'annuler plutôt |

`client_phone_exists` répond `200` et non `409` : le but est que
l'application propose la fiche existante, pas qu'elle affiche une erreur.

## Découpage

### API (`api_resi`)

La structure suit l'existant à l'identique.

```
app/models/client.ts
app/features/clients/
  dto/client.dto.ts
  repositories/client_repository.ts
  use_cases/{create,update,list,get,lookup}_client.use_case.ts
app/features/bookings/
  use_cases/create_owner_booking.use_case.ts
  use_cases/check_out_booking.use_case.ts
  availability.ts                    chevauchement de dates
  revenue_split.ts                   prorata mensuel
app/controllers/proprio/client_controller.ts
app/validators/client/client.ts
```

`CreateOwnerBookingUseCase` est distinct de `CreateBookingUseCase` : les deux
ne partagent ni les règles ni les entrées. Le use case client valide un code
promo et refuse que le propriétaire réserve son propre bien ; celui du
propriétaire gère l'acompte, le montant négocié et l'idempotence.

`COLLECTIONS` reçoit `clients: 'clients'`.

### Application (`resi_africa`)

```
core/storage/database.dart          SQLite, schéma, migrations
core/sync/sync_service.dart         écoute Connectivity, vide la file
features/clients/                   repository réel, cubits branchés
features/reservation/               cubit, bottomsheet, popup, formulaire
```

Les widgets existants sont réutilisés : `identity_document_picker`,
`document_source_sheet`, `client_card`, `client_search_bar` sont déjà écrits
et conformes au besoin.

`ClientsFakeData` disparaît. `AddClientCubit.submit()`, qui simule aujourd'hui
un appel par `Future.delayed`, est branché sur le repository.

Dépendances à ajouter : `sqflite`, `path_provider`, `uuid`.

## Tests

Les fonctions pures concentrent le risque et sont testées en premier, avant
l'implémentation :

- `revenue_split` — répartition, invariant de somme, arrondi sur la dernière
  tranche, séjour tenant dans un seul mois, séjour à cheval sur trois mois.
- `availability` — chevauchement, bornes strictes (12h/12h), réservation
  annulée ignorée, séjour englobant.
- `stay_pricing` — durées et montants des trois types de séjour,
  `minimum_stay_days` non appliqué hors séjour complet.
- Idempotence — deux appels au même `client_request_id` produisent une seule
  réservation.

Côté application : sérialisation des modèles, transaction client + réservation
en une seule unité, et ordre de vidage de la file.

## Hors périmètre

- Vue trésorerie distincte du revenu constaté. Les données sont modélisées
  (`deposit_amount`, `received_amount`), l'écran ne l'est pas.
- Tarifs demi-journée et passage saisis explicitement par le propriétaire. Les
  ratios dérivés suffisent, et l'ajout ultérieur de champs optionnels ne
  cassera rien.
- Notifications au client (SMS, WhatsApp).
- Apporteur d'affaires, présent dans la maquette mais sans règle métier
  définie à ce stade.
