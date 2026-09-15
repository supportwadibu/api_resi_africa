# Rapports exportables — conception

Un propriétaire édite un rapport PDF sur son activité : bilan financier,
performance et occupation, relevé des réservations. Il choisit un type, une
résidence et une période, et reçoit un document daté qu'il peut partager avec
sa banque ou son comptable.

Ce document fixe le contrat entre l'API et le mobile, et le contenu de chaque
rapport. Il engage les deux dépôts.

## État de départ

Côté mobile, la feature `rapport` existe en maquette : cinq types dans
`report_type_model.dart`, un formulaire complet, et un
`ReportFormCubit.generate()` qui attend deux secondes sans rien produire.
`RapportModel` est un squelette à `TODO` et `/rapports` ne correspond à aucune
route.

Côté API, rien : ni feature `reports`, ni route, ni service de rendu.

Deux des cinq types affichés n'ont aucune donnée derrière. `maintenance`
promet des interventions et des prestataires, notions absentes du modèle ;
`fiscal` promet des charges déductibles, alors que rien ne marque une dépense
comme telle. Ces deux types **sortent de l'enum** jusqu'à ce que les données
existent — les laisser produirait un document qui ment sur son contenu.

La version livrée porte donc trois types : `financial`, `performance`,
`reservations`.

## Décisions structurantes

### Le PDF est composé par l'API

Le rendu se fait en HTML/CSS côté serveur, transformé en PDF par Puppeteer.

Le paquet `pdf` de Flutter est une API de dessin : pas de CSS, pagination
manuelle, et des widgets `pw.*` qui ne se partagent pas avec les widgets de
l'application. Le HTML de print donne au contraire `@page`, les en-têtes et
pieds répétés, `page-break-inside: avoid`, la numérotation automatique et les
graphiques SVG.

L'argument décisif tient à la nature du produit : un rapport porte sur des
agrégats calculés côté serveur, il n'est de toute façon pas générable hors
réseau. Et une correction de mise en page profite à tous immédiatement, là où
une composition côté mobile attendrait une release et son adoption.

L'API tourne sur VPS/conteneur, où Chromium s'installe sans contrainte de
taille d'image ni de démarrage à froid.

### La feature `reports` ne lit pas Firestore

Elle appelle les use cases existants — `GetFinanceOverviewUseCase`, les stats
de `bookings`, `ListOwnerExpensesUseCase` — et ne touche à aucun repository
directement.

Un rapport financier et l'écran Finance doivent afficher le même chiffre. Deux
chemins de lecture parallèles divergent tôt ou tard, et un PDF qui contredit
l'écran est un défaut qu'on découvre chez le client, sur un document déjà
transmis à un tiers.

### L'URL du fichier est signée et périssable

Le PDF part sur Cloudinary en `type: 'authenticated'`, comme les pièces
d'identité dans `app/services/document_storage.ts`, et l'API renvoie une URL
signée valable quinze minutes.

Un rapport porte le chiffre d'affaires d'un propriétaire et les coordonnées de
ses clients. Il ne doit pas être lisible par qui devine un chemin. C'est le
`public_id` qui pourrait être persisté, jamais l'URL : une URL signée expire, et
la stocker produirait des liens morts.

## Contrat HTTP

### Route

```http
POST /api/v1/proprio/reports
```

Dans le groupe `proprio` existant, derrière `auth` et le contrôle de rôle,
aux côtés de `finance` et `expenses`.

`POST` et non `GET` : la génération crée une ressource, n'est pas idempotente,
et ne doit être mise en cache par aucun proxy intermédiaire.

### Requête

```jsonc
{
  "type": "financial",              // financial | performance | reservations
  "period": "this_month",           // this_month | last_month | this_year | custom
  "from": "2026-01-01",             // requis si period = custom
  "to": "2026-03-31",               // requis si period = custom
  "residence_id": "abc123"          // absent = toutes les résidences
}
```

**`period` est un mot-clé, pas deux dates.** Le mobile envoie `this_month` et
le serveur résout les bornes en `Africa/Abidjan`. Si le mobile calculait les
dates, deux téléphones mal réglés produiraient deux « ce mois-ci » différents
pour le même propriétaire. Les bornes résolues sont réimprimées dans le PDF et
renvoyées dans la réponse.

**`from` et `to` sont des dates nues (`YYYY-MM-DD`), pas des instants ISO.** Un
rapport porte sur des journées : `to` est inclusif et couvre la journée
entière. Un `2026-03-31T00:00:00Z` amputerait silencieusement le dernier jour.

**Le filtre porte sur `residence_id`, pas `property_id`.** `FinanceFilters`
filtre déjà par résidence, et `residence_scope.ts` est le seul endroit qui
réunit charges communes et charges d'unités.

**L'absence de `residence_id` signifie « toutes ».** Plutôt qu'une sentinelle
`'all'`, qu'un lecteur du code finirait par chercher comme un identifiant. Le
mobile garde `'all'` dans son menu déroulant et omet la clé à la sérialisation.

### Réponse

```jsonc
{
  "data": {
    "url": "https://res.cloudinary.com/.../rapport-financier-mars-2026.pdf?__cld_token__=...",
    "expires_at": "2026-09-15T14:30:00.000Z",
    "filename": "rapport-financier-mars-2026.pdf",
    "period": { "from": "2026-03-01", "to": "2026-03-31" }
  }
}
```

`expires_at` dit au mobile que le lien est périssable : il ouvre ou partage
immédiatement, et ne met jamais cette URL en cache SQLite. `period` porte les
bornes résolues, pour afficher « Mars 2026 » sans refaire le calcul.

### Erreurs

| Code | Statut | Cas |
|---|---|---|
| `residence_not_found` | 404 | Résidence inconnue ou appartenant à un autre propriétaire. Code déjà levé par `GetFinanceOverviewUseCase` |
| `invalid_report_period` | 422 | `custom` sans `from`/`to`, ou `from` postérieur à `to` |
| `report_period_too_large` | 422 | Plage au-delà de 24 mois |
| `report_generation_failed` | 500 | Échec du rendu ou du téléversement |

Une période sans aucune activité n'est **pas** une erreur : elle produit un PDF
valide qui constate l'absence de mouvement. Un 404 ferait croire à une panne
quand la réponse correcte est « ce mois-ci, rien ».

Le garde-fou des 24 mois protège le rendu : un relevé de réservations sur cinq
ans produirait un document de plusieurs centaines de pages et ferait expirer le
timeout.

## Structure de la feature

```text
app/features/reports/
  dto/report.dto.ts
  report_type.ts                  types, résolution des périodes
  use_cases/generate_report.use_case.ts
  renderers/
    layout.ts                     gabarit commun, tokens CSS
    financial_report.ts
    performance_report.ts
    reservations_report.ts
app/services/pdf_renderer.ts      HTML -> PDF, isole Puppeteer
app/services/report_storage.ts    PDF -> Cloudinary -> URL signée
```

Flux d'une requête :

```text
controller            valide (type, période, residence_id)
  -> GenerateReportUseCase
       -> use cases métier existants      données
       -> renderer du type                données -> HTML
       -> pdf_renderer                    HTML -> Buffer
       -> report_storage                  Buffer -> public_id -> URL signée
  -> { data }
```

`pdf_renderer` isole Puppeteer exactement comme `document_storage` isole
Cloudinary : si le moteur devient un jour un problème d'hébergement, il se
remplace sans toucher aux renderers.

## Contenu des rapports

### Gabarit commun

**Page de garde** — titre, nom du propriétaire, résidence concernée (ou
« Toutes mes résidences »), période en toutes lettres, date d'édition.
Couleurs et typographie transposées depuis `app_colors.dart` et
`app_text_styles.dart` vers un fichier de tokens CSS.

**Sommaire** — sections et numéros de page, via les compteurs CSS.

**Pied de page répété** — « RESI · <résidence> · <période> » à gauche,
« page X / Y » à droite. La période figure sur **chaque** page : une feuille
détachée du rapport ne doit pas pouvoir passer pour celle d'un autre mois.

### Bilan financier (`financial`)

1. **Chiffres clés** — CA brut, dépenses, bénéfice net, taux d'occupation,
   nombre de réservations, séjour moyen. Les six champs de `FinanceSummaryDto`.
2. **Évolution des revenus** — les `revenue_points` existants, en courbe SVG.
3. **Détail des dépenses** — tableau par catégorie, avec part du total.
4. **Note de méthode** — mode de calcul du bénéfice, et mention explicite que
   les charges communes de résidence ne sont pas réparties sur les unités.
   `docs/specs/residences-design.md` explique pourquoi cette non-répartition
   est délibérée ; un lecteur qui l'ignore y verra une erreur.

### Performance et occupation (`performance`)

1. **Chiffres clés** — taux d'occupation, jours occupés sur jours disponibles,
   séjour moyen, RevPAR.
2. **Occupation mois par mois** — histogramme SVG.
3. **Par bien** — tableau classé par occupation décroissante, quand le rapport
   couvre plusieurs biens.

Le RevPAR (`CA brut ÷ jours disponibles`) n'existe nulle part aujourd'hui. Il
est calculé dans `reports`, et non remonté dans `finance` : tant qu'un seul
consommateur l'utilise, l'y placer serait prématuré.

`booking_stats.ts` mesure l'occupation sur les jours **écoulés**, pas sur le
mois entier. Le rapport reprend cette convention à l'identique et l'écrit dans
la note de méthode — sinon le PDF et l'onglet Statistiques afficheraient deux
taux différents pour la même période.

### Relevé des réservations (`reservations`)

1. **Chiffres clés** — nombre de séjours, total encaissé, reste à percevoir,
   répartition en ligne / comptoir.
2. **Tableau des séjours**, une ligne par réservation :

| Colonne | Source |
|---|---|
| Dates | `check_in_at` / `check_out_at` |
| Bien | jointure propriété |
| Client | `client_snapshot.full_name` |
| Téléphone | `client_snapshot.phone` |
| Pièce | « Fournie » / « Non fournie », d'après `has_document_front` |
| Jours | `days_count`, avec le repli `nights_count` de l'historique |
| Montant | `total_amount` |
| Encaissé | somme des `booking_payments` de statut `success` |
| Canal | `source` : en ligne ou comptoir |

3. **Paiements en attente** — les séjours dont l'encaissé reste inférieur au
   montant convenu.

L'encaissé se calcule **exclusivement** depuis les `booking_payments` de statut
`success`. Deux pièges à écarter :

- `received_amount`, malgré son nom, ne porte pas l'argent reçu mais le
  *montant négocié* : il alimente `total_amount`, et l'écart avec
  `expected_amount` est enregistré comme remise. Le prendre pour l'encaissé
  afficherait toute réservation comme soldée et laisserait la section
  « Paiements en attente » vide en permanence.
- Les paiements `pending`, `failed`, `expired` et `cancelled` ne sont pas des
  encaissements. Sommer sans filtrer sur `success` gonflerait le total de
  tentatives avortées.

Le seul fournisseur est Wave. Un séjour comptoir réglé en espèces n'a donc
aucun `booking_payment` et apparaît comme non encaissé. Le rapport le signale
en note plutôt que de le présenter comme un impayé.

Le nom et le téléphone viennent du `client_snapshot`, donc figés au moment de
la réservation : renommer une fiche client ne réécrit pas l'historique.

Deux mentions figurent dans le document :

- La colonne **Pièce** reflète l'état **au moment de l'édition**, pas celui du
  séjour. Le nom et le téléphone sont figés, l'état de la pièce non : il vit
  sur la fiche client et évolue. Sans cette mention, le rapport serait
  trompeur.
- Le libellé est « Fournie / Non fournie », jamais « Vérifiée ». Aucune
  vérification d'identité n'existe dans le modèle : `has_document_front`
  atteste d'un dépôt, pas d'un contrôle. Sur un document susceptible de servir
  de preuve, la nuance est substantielle.

Le PDF contient des données personnelles. Une mention le rappelle en pied de
section.

## Rendu technique

`app/services/pdf_renderer.ts` encapsule Puppeteer :

- **Instance de navigateur réutilisée** entre les requêtes. Le démarrage coûte
  environ 300 ms, le payer à chaque rapport serait du gaspillage.
- **Timeout de 30 secondes** sur le rendu, mappé en `report_generation_failed`.
  Sans lui, une page qui ne se stabilise jamais retient un onglet
  indéfiniment.
- **Polices embarquées localement**, jamais chargées depuis un CDN. Un rendu
  qui dépend du réseau échoue silencieusement, en produisant un PDF en police
  système au lieu d'une erreur franche.
- Format A4, `printBackground` actif.

## Tests

`tests/unit/`, sans accès à Firebase, en priorité sur le calcul métier :

- résolution des périodes en `Africa/Abidjan`, bornes incluses, et passage
  d'année sur `last_month` en janvier ;
- validation de `custom` : `from` postérieur à `to`, plage au-delà de 24 mois ;
- calcul du RevPAR, dont le cas `jours disponibles = 0`, qui ne doit pas
  produire `Infinity` ;
- agrégation des paiements et détection du reste à percevoir.

Les renderers sont testés sur le **HTML produit** — présence des totaux, nombre
de lignes attendu — jamais sur le PDF binaire : comparer des octets de PDF
donne des tests qui cassent à chaque version de Chromium.

## Répercussions côté mobile

Le contrat engage les deux dépôts. Côté `mobile/` :

- `api_endpoints.dart` : `/rapports` devient `/proprio/reports`.
- `RapportModel`, aujourd'hui un squelette à `TODO`, devient
  `ReportExportModel` : `url`, `expiresAt`, `filename`, `period`.
- `ReportFormCubit.generate()` perd son `Future.delayed` et appelle le
  repository.
- `ReportFormState` gagne un état de résultat porteur de l'URL et un état
  d'erreur porteur d'un message affichable.
- `PropertySelector` devient `ResidenceSelector`, et `selectedPropertyId`
  devient `selectedResidenceId`. Le widget liste déjà des résidences
  (« Toutes mes résidences ») : son nom actuel ment sur la donnée, et
  quelqu'un finirait par y brancher un bien.
- L'enum `ReportType` perd `maintenance` et `fiscal`, avec leurs entrées dans
  `label`, `description` et `iconPath`.
- L'URL reçue n'est jamais mise en cache SQLite : elle expire en quinze
  minutes.

## Hors périmètre

- **`maintenance` et `fiscal`** — ils demandent d'abord une notion
  d'intervention et de prestataire, et un marqueur de déductibilité sur les
  dépenses. Deux sujets métier à part entière, à traiter avant de rouvrir ces
  types.
- **Vérification d'identité** — `id_verified_at` / `id_verified_by` sur la
  fiche client, et l'action correspondante côté mobile. Nécessaire pour
  qu'un rapport puisse écrire « Vérifiée » ; sans eux, le libellé reste
  « Fournie ».
- **Génération asynchrone** — une file de jobs avec interrogation du statut.
  Le garde-fou des 24 mois maintient les rendus dans les limites d'une
  réponse directe. À rouvrir si les temps de rendu s'allongent.
- **Autres formats** — Excel, CSV. Seul le PDF est prévu.
