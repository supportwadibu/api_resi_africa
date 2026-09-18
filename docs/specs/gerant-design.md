# Rôle gérant — conception

Un propriétaire délègue l'exploitation quotidienne d'une partie de ses
logements à un **gérant** : une personne qui enregistre les réservations au
comptoir, tient la disponibilité des logements, saisit les dépenses et suit ses
chiffres — sans accéder au reste du compte du propriétaire.

Ce document fixe le vocabulaire, le modèle de données et les arbitrages. Il
engage les deux dépôts : le contrat API décrit ici est celui que consomme le
mobile.

---

## Vocabulaire

**Propriétaire** — le titulaire du compte, de l'abonnement et des données.
Rôle `proprio`. Reste le seul propriétaire de tout ce que produit un gérant.

**Gérant** — un utilisateur de rôle `gerant`, créé par un propriétaire, qui
agit **pour le compte de** celui-ci. Il n'a ni abonnement, ni dossier de
validation, ni données propres.

**Périmètre** — l'ensemble des logements qu'un gérant peut voir et servir.
Toujours une liste de logements ; jamais une résidence.

**Affectation** — le document qui lie un gérant à un propriétaire et porte son
périmètre.

Le mot « portefeuille » n'est pas employé : il suggère une propriété, alors que
le gérant n'en détient aucune.

---

## Arbitrages

### Le gérant agit pour le compte du propriétaire

Toute donnée qu'un gérant crée — réservation, client, dépense — porte
l'`owner_id` du **propriétaire**, jamais celui du gérant.

Le domaine entier est cloisonné par `owner_id` : `bookings`, `clients`,
`expenses`, `properties`, `residences`, `booking_payments`. Faire du gérant un
`owner_id` à part entière fracturerait cette vue — le propriétaire perdrait de
son tableau de bord tout ce que ses gérants produisent — et imposerait une
migration des données existantes.

Le gérant est donc un **acteur**, pas un propriétaire. La distinction est
portée par un champ d'audit dédié, et par lui seul.

### L'affectation se fait par logement, jamais par résidence

Un gérant peut recevoir 6 des 10 logements d'une même résidence. Le niveau
logement est le seul qui couvre à la fois ce cas et celui de la résidence
entière.

« Affecter une résidence entière » est donc un **geste d'interface** : le
mobile coche la résidence, l'app déplie ses logements et les envoie tous. Côté
serveur, il n'existe qu'une liste de `property_id`.

Une liste de `residence_id` a été écartée. Elle aurait créé deux mécanismes
concurrents pour un seul besoin — héritage d'un côté, énumération de l'autre —
et deux chemins de filtrage à tester. Conséquence assumée : **un logement
ajouté après coup à une résidence entièrement gérée n'est pas affecté
automatiquement.** Le propriétaire l'ajoute explicitement. En échange, il n'y a
aucune ambiguïté sur qui gère quoi, et aucune règle d'héritage à déboguer.

### Le gérant voit le brut de son périmètre, jamais le net

Il voit, sur ses seuls logements : le nombre de réservations, les
encaissements, le taux d'occupation, et le total des dépenses saisies sur ces
logements. Filtrables par mois ou entre deux dates.

Il ne voit pas le **revenu net**. Le net déduit des charges qui ne relèvent pas
de lui : l'abonnement du propriétaire, les charges communes de la résidence,
les dépenses saisies par le propriétaire ou par un autre gérant sur d'autres
logements. Un net calculé sur un périmètre partiel n'est pas une marge
partielle — c'est un chiffre faux, qui donnerait au gérant une idée erronée de
la rentabilité du propriétaire.

Les fonctions `finance` et `rapport` ne sont donc pas fermées au gérant : elles
sont **cloisonnées**. Elles acceptent le périmètre et filtrent dessus.

### Les instantanés figés ne changent pas

Une réservation saisie par un gérant fige le prix, la remise et le
`client_snapshot` exactement comme aujourd'hui. Le champ d'audit `created_by`
n'entre dans aucun calcul : c'est une donnée de traçabilité, pas une donnée
métier.

---

## Modèle de données

### Rôle

`ROLE_NAMES` devient `['admin', 'proprio', 'client', 'gerant']`.

La collection `roles` étant clé-par-nom — l'identifiant du document *est* le
nom du rôle —, l'ajout se réduit à un `upsert` de plus dans le seed. Aucune
migration, aucun index.

Le champ `permissions: string[]` de `RoleDocument` reste inutilisé. Les
autorisations sont portées par le découpage des routes, qui les rend lisibles
dans `start/routes.ts` ; un moteur de permissions dynamiques n'apporterait rien
tant que les rôles sont fixes.

### Compte gérant

Un `UserDocument` ordinaire, avec `role_id: 'gerant'`.

- `metadata.created_by` porte l'identifiant du propriétaire — le champ existe
  déjà.
- `auth_channel` vaut `phone` ou `email` selon ce que saisit le propriétaire.
- `password` est fixé par le propriétaire à la création. **Pas d'OTP** : le
  propriétaire enregistre une personne qu'il connaît et dont il a vérifié le
  numéro. Le gérant change son mot de passe depuis son profil.
- `is_verified` vaut `true` dès la création, pour la même raison.
- `owner_status`, `validated_by`, `validated_at`, `rejection_reason` restent à
  leur valeur par défaut et ne sont **jamais lus** pour ce rôle : ils
  concernent la validation administrative d'un propriétaire.

### Affectation

Nouvelle collection `manager_assignments`, ajoutée à `COLLECTIONS`.

```ts
export interface ManagerAssignmentDocument {
  owner_id: string
  manager_id: string
  property_ids: string[]
  is_active: boolean
  created_at: Date
  updated_at: Date
}
```

**L'identifiant du document est le `manager_id`.** Même motif que
`app/models/role.ts` : la lecture devient un accès direct, sans requête ni
index — elle a lieu à chaque requête authentifiée d'un gérant —, et l'unicité
qui compte ici, *un gérant ne sert qu'un seul propriétaire*, découle de la clé
elle-même. Firestore ne sachant pas exprimer d'index unique, c'est la seule
garantie qui tienne.

`is_active: false` suspend un gérant sans supprimer son historique ni son
compte.

### Traçabilité

Champ optionnel `created_by: string | null` sur `booking`, `expense` et
`client`.

Lu avec un repli explicite — `doc.created_by ?? null` — car les documents
écrits avant cette version ne le portent pas. Absent signifie « saisi par le
propriétaire », qui était jusqu'ici le seul acteur possible.

---

## Résolution du périmètre

### Le contexte de périmètre

```ts
export interface ActorScope {
  /** Propriétaire des données. Toute lecture et écriture reste filtrée dessus. */
  ownerId: string
  /** Auteur réel de l'action, reporté dans `created_by`. */
  actorId: string
  /** Logements accessibles. `null` = aucune restriction (propriétaire). */
  propertyIds: string[] | null
}
```

`propertyIds: null` et `propertyIds: []` sont deux choses distinctes : le
premier est un accès total, le second un gérant sans aucun logement affecté,
qui ne doit rien voir. Confondre les deux ouvrirait tout le compte à un gérant
fraîchement créé.

### Le middleware `scope()`

S'exécute après `auth()`.

Pour un `proprio` : `{ ownerId: authUser.id, actorId: authUser.id,
propertyIds: null }`. Le chemin actuel est strictement inchangé — aucune
lecture supplémentaire, aucune régression possible.

Pour un `gerant` : lecture de `manager_assignments/{authUser.id}`.

- Document absent ou `is_active: false` → `manager_not_assigned` (403).
- Sinon `{ ownerId: doc.owner_id, actorId: authUser.id, propertyIds:
  doc.property_ids }`.

### Le filtrage, et la limite des 30 valeurs

Firestore plafonne `in` et `array-contains-any` à 30 valeurs. Un gérant peut
dépasser ce seuil.

La règle est donc en deux branches, dans les repositories :

- **30 logements ou moins** — `where('owner_id', '==', ownerId)` combiné à
  `where('property_id', 'in', propertyIds)`.
- **au-delà** — `where('owner_id', '==', ownerId)` seul, puis filtrage de
  l'appartenance en mémoire.

Le second motif existe déjà dans `app/models/property.ts`
(`needsInMemoryFilter` / `matchesInMemory`) et doit être suivi plutôt que
réinventé.

Le `where('owner_id', ...)` est conservé dans les deux branches. Il n'est pas
redondant : il est la garantie de dernier recours si la liste de logements était
un jour construite à tort.

---

## Contrat API

Préfixe dédié `/api/v1/gerant`, gardé par `role(['gerant'])` puis `scope()`.

Un préfixe séparé plutôt qu'une ouverture des routes `proprio` à deux rôles :
le périmètre du gérant devient lisible d'un coup d'œil dans `start/routes.ts`,
et ce qui n'y figure pas lui est fermé par construction — non par une condition
qu'on peut oublier d'écrire.

Les contrôleurs vivent dans `app/controllers/gerant/` et **réutilisent les use
cases existants**. Seul le `scope` transmis diffère. Dupliquer les use cases
dupliquerait la règle métier, qui divergerait.

```
GET    /gerant/properties                 logements affectés
GET    /gerant/properties/:id             détail
PATCH  /gerant/properties/:id/availability disponibilité uniquement
GET    /gerant/residences                 résidences contenant ses logements (lecture)

GET    /gerant/bookings                   liste
POST   /gerant/bookings                   création comptoir (idempotente)
GET    /gerant/bookings/:id               détail
PATCH  /gerant/bookings/:id               modification
PATCH  /gerant/bookings/:id/cancel        annulation
POST   /gerant/bookings/:id/payments      encaissement

GET    /gerant/clients                    carnet clients du propriétaire
POST   /gerant/clients                    création
POST   /gerant/clients/lookup             recherche par téléphone (cloisonnée)
GET    /gerant/clients/:id                détail
PATCH  /gerant/clients/:id                modification

GET    /gerant/expenses                   dépenses de ses logements
POST   /gerant/expenses                   saisie
PATCH  /gerant/expenses/:id               modification
DELETE /gerant/expenses/:id               suppression

GET    /gerant/finance/overview           brut, filtrable from/to
GET    /gerant/profile                    son profil
PATCH  /gerant/profile                    dont changement de mot de passe
```

Fermé au gérant : abonnement et facturation, création et suppression de
logements et de résidences, modification des tarifs, gestion des gérants,
rapports exportables du propriétaire, feedbacks.

**`GET /gerant/residences` est un regroupement d'affichage.** Il rend les
résidences qui contiennent au moins un logement du périmètre, et chacune n'y
expose que ces logements-là. Une résidence de 10 logements dont 6 affectés s'y
présente avec 6 unités. Le champ dénormalisé `units_count` n'est donc **pas**
renvoyé tel quel au gérant : il compte les 10 et trahirait l'existence des 4
autres.

**`GET /gerant/clients` ne rend pas tout le carnet.** Les clients sont
cloisonnés par `owner_id`, pas par logement : servir le carnet entier
donnerait à un gérant la clientèle complète du propriétaire, y compris celle
d'autres résidences et d'autres gérants. Le gérant ne voit qu'un client ayant
au moins une réservation sur un logement de son périmètre.

Un client qu'il vient de créer au comptoir n'a, l'espace d'un instant, aucune
réservation. Il reste donc visible de son créateur : la lecture retient un
client dès lors qu'il a séjourné dans le périmètre **ou** que son `created_by`
est le gérant qui interroge. Sans cette seconde branche, une fiche
disparaîtrait entre sa création et la réservation qu'elle sert.

**La création est soumise à la même règle.** `POST /gerant/clients` dédoublonne
par téléphone : quand la fiche existe déjà, elle est renvoyée telle quelle.
Cadré sur le seul `owner_id`, ce dédoublonnage livrait la fiche complète —
pièce d'identité comprise — de n'importe quel client du propriétaire, sur
simple envoi d'un numéro. C'est la même porte que ferme la recherche par
téléphone, décrite plus bas : deux chemins mènent d'un numéro à une fiche, et
laisser l'un ouvert suffirait à rendre l'autre inutile.

Quand la fiche trouvée est hors périmètre, la réponse est donc un **accusé nu** :

```json
{ "data": { "client": null, "already_existed": true } }
```

Un accusé plutôt qu'un 403 : le gérant doit pouvoir constater qu'il n'y a rien
à créer, sans rien apprendre de la fiche — pas même son existence. Un 403 serait
lui-même l'oracle que la règle cherche à fermer, puisqu'il ne se distinguerait
qu'en présence d'une fiche.

**Le mobile doit traiter `client: null` sur cette route**, où il recevait
jusqu'ici un objet. `POST /proprio/clients` est inchangé.

**`POST /gerant/clients/lookup` est ouverte, sous la même règle.** Elle ne
l'était pas, et le mobile l'appelait quand même : `clientLookup(role)` bascule
sur le rôle stocké, si bien que le gérant postait sur une route inexistante et
recevait un 404. L'appel part en débounce pendant la saisie du téléphone au
comptoir, et son échec est silencieux — le carnet du gérant se remplissait donc
de doublons du même client, précisément ce que la recherche existe pour éviter.

Fermer la route n'était pas tenable, et l'ouvrir telle quelle l'était encore
moins : la recherche est cadrée sur le seul `owner_id`, si bien qu'un numéro
quelconque livrait la fiche complète — pièce d'identité et cumuls compris — de
n'importe quel client du propriétaire. C'est exactement « sonder le carnet du
propriétaire avec un numéro ». Le périmètre descend donc jusqu'au use case, sur
la règle de visibilité commune : séjour dans le périmètre, **ou** fiche créée
par le gérant qui interroge.

Hors périmètre, la réponse est celle d'un **numéro inconnu** :

```json
{ "exists": false, "client": null }
```

Et non `exists: true` avec la fiche omise, comme le fait l'accusé nu de
`POST /gerant/clients`. La différence tient à ce qu'il reste à décider. La
création doit accuser qu'il n'y a rien à créer, faute de quoi l'application
retenterait ; une recherche n'a aucune action en suspens et peut se taire tout à
fait. Or `exists: true` serait ici l'oracle même que la règle ferme, puisque
seule une fiche existante le distinguerait. Les deux réponses sont donc
indistinguables octet pour octet, ce que verrouille un test.

Conséquence voulue : un gérant qui saisit le numéro d'un client hors périmètre
crée une **seconde fiche**, portant son `created_by`. Deux fiches pour une même
personne dans le carnet du propriétaire est le prix du cloisonnement — le seul
moyen de l'éviter serait de révéler la première.

Côté mobile, rien à changer : `ClientLookup.fromJson` lit `exists` et un
`client` déjà nullable, et `exists: false` remet proprement l'état de saisie à
zéro.

**`GET /gerant/clients/:id/bookings` rend les cumuls du périmètre, non de
l'historique.** Deux périmètres s'y croisent : la fiche doit relever du carnet
visible par le gérant, et les séjours rendus se limiter à ses logements. Un
client fidèle peut avoir séjourné ailleurs dans le parc du propriétaire.

Les cumuls — nombre de séjours, total versé, dernier séjour — portent donc sur
les seuls séjours rendus. Servir le total complet afficherait « 12 séjours,
480 000 F » au-dessus d'une liste de 6 lignes : un total qui contredit sa
propre liste, et dont l'écart dirait au gérant ce que la règle cherche
précisément à lui fermer. C'est le principe posé pour le relevé financier,
appliqué au carnet — six logements gérés sur dix, six logements comptés.

Le calcul est d'ailleurs déjà bon par construction : `computeClientStats` agrège
la liste rendue, et non un compteur stocké sur la fiche. Le cache `stats` de la
fiche n'est jamais réécrit depuis une lecture cloisonnée, sans quoi les totaux
du propriétaire rétréciraient au gré de qui consulte son carnet.

Le rejeu d'idempotence obéit à la même logique. `POST /gerant/bookings` retrouve
une réservation par `client_request_id` : la garde d'écriture valide le
`property_id` *de la requête*, mais le rejeu rend un document **différent**. Le
périmètre est donc revérifié sur la réservation retrouvée. Un gérant qui rejoue
sa propre saisie, sur un logement de son périmètre, reçoit le même DTO sans
créer de doublon — c'est la garantie sur laquelle repose la file hors ligne.

### Routes propriétaire ajoutées

```
GET    /proprio/managers                  liste de ses gérants
POST   /proprio/managers                  création (compte + affectation)
GET    /proprio/managers/:id              détail et périmètre
PATCH  /proprio/managers/:id              renommage, coordonnées
PUT    /proprio/managers/:id/properties   remplacement du périmètre
PATCH  /proprio/managers/:id/status       activation / suspension
```

`PUT` sur le périmètre, non `PATCH` : le propriétaire envoie la liste complète
des logements qu'il veut affecter. Un ajout et un retrait dans le même geste
deviennent une seule écriture, et l'état obtenu ne dépend pas de l'ordre des
requêtes.

### Codes d'erreur

Stables, consommés par le mobile.

| Code | Statut | Sens |
|---|---|---|
| `manager_not_assigned` | 403 | Aucune affectation active pour ce gérant. |
| `out_of_scope` | 403 | La ressource existe mais est hors périmètre. |
| `property_not_owned` | 422 | Logement affecté n'appartenant pas au propriétaire. |
| `manager_already_exists` | 409 | Un compte porte déjà cet e-mail ou ce téléphone. |
| `manager_contact_required` | 422 | Ni e-mail ni téléphone : le gérant n'aurait aucun moyen de se connecter. |
| `manager_not_found` | 404 | Gérant inconnu, ou rattaché à un autre propriétaire. |
| `property_required` | 422 | Dépense de gérant sans logement : les charges communes de résidence lui sont fermées. |
| `invalid_payment_amount` | 422 | Montant d'encaissement nul ou négatif. |
| `booking_cancelled` | 409 | Réservation annulée : ni prolongation ni encaissement. |

`manager_not_found` est un 404 là où les accès d'un gérant rendent un 403
`out_of_scope`. La différence est voulue : un gérant sait qu'il travaille sur un
parc dont une partie lui échappe, tandis qu'un propriétaire interrogeant le
gérant d'autrui ne doit pas apprendre que ce compte existe.

`out_of_scope` est un 403, jamais un 404. Un 404 laisserait deviner par
tâtonnement quels identifiants existent chez le propriétaire.

**Aucun plafond de gérants** n'est posé dans cette version. Les plans portent
`max_residences`, pas d'équivalent pour les gérants, et en inventer un
supposerait une décision commerciale qui n'a pas été prise. Le jour où elle le
sera, elle s'ajoutera en `max_managers` sur le plan, contrôlée à la création.

---

## Mobile

### Navigation

`RoleName` gagne `gerant`. Le routeur racine bascule vers un `GerantShell`
portant sa propre barre de navigation : **Réservations · Clients · Dépenses ·
Logements**, plus un écran de chiffres accessible depuis l'accueil.

Ni abonnement, ni gestion de gérants, ni création de logement ou de résidence.
Les écrans absents de la navigation ne sont pas seulement masqués : leurs
routes ne sont pas montées pour ce rôle.

### Chemins d'API

Un `basePathForRole` dans `api_endpoints.dart` fait pointer les repositories
existants vers `/gerant/*` ou `/proprio/*` selon le rôle stocké. Un point de
bascule unique, plutôt que des conditions dispersées dans chaque repository.

### Hors ligne

Inchangé. `client_request_id` et la file `pending_bookings` sont indifférents
au rôle : l'idempotence repose sur l'identifiant de requête, pas sur l'auteur.

Une distinction compte à la synchronisation :

- **`booking_period_conflict` (409)** — conflit de période, à arbitrer par une
  personne. Comportement actuel, décrit dans
  [offlin-desgin.md](offlin-desgin.md).
- **`out_of_scope` (403)** — le logement a été retiré du périmètre du gérant
  entre la saisie et l'envoi. **Définitif : ne jamais rejouer.** La saisie est
  retirée de la file et signalée au gérant, qui doit en référer au
  propriétaire. La rejouer boucherait la file indéfiniment.

### Création d'un gérant, côté propriétaire

Un écran sous son profil : nom, téléphone ou e-mail, mot de passe initial, puis
sélection du périmètre. La sélection présente les résidences dépliables ;
cocher une résidence coche ses logements. Ce que l'app transmet reste, dans
tous les cas, une liste de `property_id`.

---

## Tests

Les tests unitaires ne contactent pas Firebase et portent sur la résolution du
périmètre et le cloisonnement des calculs.

**Résolution du périmètre**

- `propertyIds: null` (propriétaire) donne un accès total.
- `propertyIds: []` ne donne accès à rien — et surtout pas à tout.
- Affectation absente ou inactive → `manager_not_assigned`.
- Bascule à 30 logements : les deux branches de filtrage rendent le même
  résultat. À tester à 29, 30 et 31 — la limite Firestore est une bordure, et
  une erreur d'inégalité y passerait inaperçue.

**Cloisonnement financier** — l'invariant central, dans l'esprit des tests
`finance` existants :

> Une résidence de 10 logements, 6 affectés à un gérant. Le relevé rendu au
> gérant porte sur les 6, jamais sur les 10. Les encaissements des 4 autres
> n'apparaissent dans aucun total.

- Le relevé du gérant ne contient aucun champ de revenu net.
- Une dépense saisie par un gérant apparaît dans le relevé du propriétaire.

**Cloisonnement du carnet clients**

- Un client du propriétaire n'ayant séjourné que hors périmètre est invisible
  au gérant.
- Un client créé par le gérant lui reste visible avant toute réservation.
- La recherche par téléphone rend, hors périmètre, une réponse **identique** à
  celle d'un numéro inconnu — comparée sur la sérialisation entière, sans quoi
  un champ oublié passerait.
- Le contrôleur de recherche transmet bien `ctx.scope` : le périmètre est
  facultatif sur le use case, si bien qu'un contrôleur qui l'omet compile et
  sonde tout le carnet. Seule une assertion sur l'argument reçu l'attrape.
- L'historique d'un client ne montre aucun séjour hors périmètre, et ses cumuls
  ne les comptent pas.

**Cloisonnement de l'affichage des résidences**

- Une résidence de 10 logements dont 6 affectés se présente au gérant avec 6
  unités, et son `units_count` ne révèle pas les 10.

**Écriture**

- Une réservation créée par un gérant porte l'`owner_id` du propriétaire et le
  `created_by` du gérant.
- Une réservation sur un logement hors périmètre est refusée par
  `out_of_scope`.
- Un `created_by` absent sur un document ancien ne fait échouer aucune lecture.
