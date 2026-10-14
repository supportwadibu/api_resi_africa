# Forfaits, apporteur d'affaire, OCR et facture WhatsApp — conception

Lot de six évolutions côté propriétaire, décidées ensemble. Elles engagent les
trois dépôts : l'API porte les règles, le mobile et le backoffice suivent le
contrat.

1. Deux forfaits d'abonnement, 3 000 F et 5 000 F, et le cloisonnement des
   fonctions qui en découle.
2. Un taux d'occupation qui ne se dégrade plus en cours de mois.
3. Un apporteur d'affaire sur la réservation, commissionné à 10 %.
4. L'OCR de la pièce d'identité à la saisie du client.
5. L'affichage des photos de la pièce sur la fiche client.
6. L'envoi de la facture d'un séjour par WhatsApp.

---

## 1. Forfaits

### Ce qui a été décidé

Deux paliers, et deux seulement. Pas de changement de palier en cours
d'abonnement : un propriétaire change de forfait à l'échéance, en souscrivant
de nouveau.

| Palier | Prix | Accès |
| --- | --- | --- |
| `basic` | 3 000 F | Fonctions d'enregistrement : résidences, logements, réservations, clients saisis pendant la réservation, apporteur d'affaire |
| `full` | 5 000 F | Toute l'application propriétaire, y compris les fonctions à venir |

### Le palier est porté par le plan

Nouveau champ `tier: 'basic' | 'full'` sur `PlanDocument`.

Une liste de fonctionnalités par plan (`features: string[]`, déjà présent mais
purement descriptif) a été écartée comme mécanisme d'autorisation. Le forfait
5 000 F doit couvrir les fonctions *futures* : une liste imposerait de la
compléter à chaque ajout, et un oubli fermerait une fonction à des abonnés qui
l'ont payée. Avec un palier, une nouvelle route se range dans `full` par
défaut. `features` reste un texte de présentation.

**Repli sur l'historique** : un plan sans `tier` est lu `full`. Les plans créés
avant cette version donnaient accès à tout ; les lire `basic` retirerait des
fonctions à des abonnés en cours.

### Le palier est figé sur l'abonnement

Nouveau champ `plan_tier` sur `SubscriptionDocument`, copié du plan à la
souscription et jamais recalculé — même règle que `daily_price` sur une
réservation. Un administrateur qui repasse un plan de `full` à `basic` ne doit
pas retirer des fonctions à un propriétaire qui a payé l'accès complet.

Résolution de l'accès d'un propriétaire, fonction pure
`resolvePlanAccess(subscription)` → `'full' | 'basic' | null` :

| Situation | Accès |
| --- | --- |
| Abonnement `active` avec `plan_tier` | ce palier |
| Abonnement `active` sans `plan_tier` (historique) | `full` |
| Essai (`trial`) | `full` — l'essai fait découvrir le forfait complet |
| Aucun abonnement `active` ou `trial` (expiré, annulé, `pending`, jamais souscrit) | `null` — **compte inactif** |

Un compte inactif ne peut pas utiliser l'application : il doit souscrire un
forfait. C'est un **changement de comportement pour les comptes existants** —
aujourd'hui, aucune route ne vérifie l'abonnement, et `can_operate`, déjà
calculé par `GET /proprio/subscription`, n'est appliqué nulle part.

**Essai à l'inscription.** L'inscription par e-mail ou téléphone
(`RegisterVerifyUseCase`) n'ouvrait aucun essai — seule l'inscription Google
le faisait, et `ValidateOwnerUseCase` en filet. Sans conséquence tant que rien
n'était bloqué ; avec `plan()`, un compte neuf serait inactif jusqu'à sa
validation. L'essai s'ouvre désormais à la vérification de l'inscription, de
façon non bloquante comme pour Google.

`pending` figure dans `ACTIVE_SUBSCRIPTION_STATUSES`, mais n'ouvre aucun
accès : il désigne un abonnement non payé. Le paiement Wave (plus bas) ne
crée d'ailleurs l'abonnement qu'une fois le paiement confirmé, si bien
qu'aucun `pending` n'est plus écrit.

### Le middleware `plan()`

Placé après `auth()`, `role()` et, pour le gérant, `scope()`. Deux niveaux :

- `middleware.plan()` — un abonnement actif, quel que soit le palier. Sinon
  `DomainError('subscription_required', 'Votre abonnement est inactif.
  Souscrivez un forfait pour continuer.', 403)`.
- `middleware.plan('full')` — le palier complet. Sinon
  `DomainError('plan_upgrade_required', 'Cette fonction est réservée au
  forfait 5 000 F.', 403)`.

Pour un propriétaire, c'est son propre abonnement ; pour un gérant, celui du
propriétaire pour qui il agit (`ctx.scope.ownerId`). Les gérants sont une
fonction `full` : l'espace gérant entier exige ce palier, et un propriétaire
inactif rend ses gérants inactifs.

Le middleware n'appelle pas l'expiration passive (`expireOverdue`) : elle
fait une requête globale suivie d'un batch d'écritures, trop coûteux à chaque
requête. `resolvePlanAccess` compare lui-même `end_date` à l'instant : un
abonnement échu que le cron n'a pas encore basculé n'ouvre déjà plus rien.

L'accès est résolu sur **tous** les abonnements vivants de l'utilisateur, et le
meilleur l'emporte : l'unicité n'étant qu'applicative, un `pending` resté dans
l'historique ne doit pas masquer l'abonnement payé qui l'accompagne.

### Répartition des routes propriétaire

Ouvertes **sans abonnement actif** — ce qu'il faut pour souscrire et se faire
aider :

- `subscription` (état), `plans` (forfaits proposés), paiement d'abonnement
- `profile` — le dossier de validation se dépose avant tout
- `feedbacks` — le support doit rester joignable par un compte bloqué

Ouvertes en `basic` :

- `properties` — toutes, sauf `GET stats`
- `residences` — toutes
- `bookings` — liste, création, clôture (aperçu compris), prolongation
- `clients` — `POST lookup` et `POST /` seulement : le client se crée pendant
  la réservation

Réservées au palier `full` :

- `properties/stats`, `bookings/stats`, `finance/*` — statistiques
- `reports` — PDF
- `clients` — liste, fiche, réservations d'un client, modification : le
  carnet et les fiches
- `expenses/*`
- `managers/*`, et tout le groupe `gerant`

Le choix se lit dans `start/routes.ts` : les routes `full` sont regroupées
sous le middleware plutôt que marquées une à une, pour qu'une route ajoutée à
un groupe hérite de sa règle.

### Souscription par Wave

Aujourd'hui, aucun propriétaire ne peut souscrire : `SubscribeToPlanUseCase`
n'est branché sur aucune route, et le backoffice ne sait que lister et annuler.
Bloquer les comptes inactifs sans ouvrir ce chemin enfermerait tout
propriétaire dehors à la fin de son essai. La souscription se fait donc dans
l'application, par Wave, sans geste administrateur.

Parcours :

1. `GET /proprio/plans` — plans actifs, triés par prix.
2. `POST /proprio/subscription/checkout { plan_id }` — contrôle le plan
   (actif), puis les règles de `checkoutRefusal` ci-dessous. Crée une session
   Wave au prix du plan, et un `payment_histories` `pending` qui fige
   `plan_id`, `plan_tier`, `duration_days` et le montant, avec la référence
   `SUB-<user_id>-<uuid>` et l'identifiant de session. Renvoie `payment_url`
   et la référence.
3. Le mobile ouvre `payment_url` (Wave).
4. Le webhook Wave, ou le retour du propriétaire dans l'app, déclenche la
   **confirmation**.
5. Paiement confirmé → `buildPaidSubscription` : clôt l'abonnement vivant,
   crée l'abonnement `active` avec `plan_tier` figé, relie le paiement à
   l'abonnement (`subscription_id`).

**Renouvellement et changement de forfait** (`checkoutRefusal`) :

- sans abonnement, pendant un essai ou après l'échéance : tout forfait ;
- abonnement payant à plus de 7 jours de l'échéance : 409
  `subscription_already_active` ;
- dans les 7 derniers jours : renouvellement du **même** palier seulement
  (409 `plan_change_not_allowed` sinon). Les jours restants sont reportés en
  tête de la nouvelle période : payer tôt ne fait rien perdre. Changer de
  forfait se fait à l'échéance.

Un paiement confirmé est toujours honoré, l'argent étant reçu : l'abonnement
vivant est clos (`upgraded_to_plan` pour un essai, `renewed` pour un
renouvellement) et un seul reste actif.

**Paiements en attente.** Avant d'ouvrir un nouveau paiement, les sessions
restées `pending` sont soldées : relues chez Wave — si l'une a été payée, elle
est constatée et le nouveau paiement refusé (409
`subscription_payment_received`), le propriétaire ne paie pas deux fois —, sinon
expirées chez Wave (`POST /v1/checkout/sessions/:id/expire`) pour qu'un vieux
lien ne puisse plus être payé en plus du nouveau.

**La confirmation ne croit jamais le corps du webhook.** Le webhook actuel
vérifie une signature calculée sur un corps re-sérialisé — pas les octets
reçus — et l'accepte sans contrôle quand `WAVE_WEBHOOK_SECRET` est absent.
Le propriétaire connaît l'identifiant de sa session, visible dans l'URL de
paiement : un faux `status: succeeded` lui ouvrirait un abonnement gratuit. La
confirmation relit donc la session chez Wave (`GET
/v1/checkout/sessions/:id`, avec la clé d'API) et n'active que si
`payment_status` vaut `succeeded` **et** que montant et devise sont ceux du
paiement enregistré. Le webhook n'est qu'un signal.

La confirmation est idempotente : un paiement qui n'est plus `pending` est
rendu tel quel, si bien qu'un webhook rejoué ou une confirmation concurrente
ne crée pas deux abonnements. Clôture de l'abonnement vivant, création du
nouveau et passage du paiement à `success` se font dans **une** transaction
Firestore qui relit le statut du paiement.

**Webhook dédié.** Le paiement Wave de l'application propriétaire ne porte que
sur l'abonnement. Il a son propre service (`WaveSubscriptionService`) et son
propre webhook, `POST /payments/wave/subscriptions/webhook`, à déclarer dans le
portail Wave (événements `checkout.session.*`). Le flux Wave des réservations
— antérieur, et resté tel quel — n'est pas touché.

Le webhook vérifie l'en-tête `Wave-Signature` (`t=…,v1=…`) sur l'horodatage
suivi du corps **brut** (`ctx.request.raw()`), plusieurs `v1` admis pendant une
rotation du secret, tolérance de 5 minutes. Sans `WAVE_WEBHOOK_SECRET`, il est
refusé en production et accepté avec un avertissement ailleurs. La session est
lue dans `data.id` — à la racine, `id` désigne l'événement. Toute réponse est
un 200 une fois la signature admise, pour que Wave cesse de rejouer.

**Page de retour.** `success_url` et `error_url` pointent sur
`GET /payments/wave/subscriptions/:reference/return`, page publique qui
déclenche la confirmation et invite à revenir dans l'application. `APP_URL`
doit être en `https` : Wave refuse les autres.

`POST /proprio/subscription/checkout/:reference/confirm` — même confirmation,
appelée par le mobile au retour de Wave : l'abonnement s'active sans attendre
un webhook retardé ou perdu.

`payment_histories.subscription_id` devient `string | null` : le paiement
précède l'abonnement. Repli sur l'historique : les documents existants
portent tous un identifiant.

### Contrat

- `PlanDto.tier`, `SubscriptionDto.plan_tier` (toujours renseigné en sortie,
  le repli étant appliqué par le repository).
- `GET /proprio/subscription` : nouveau champ `plan_access` (`full`, `basic`
  ou `null`) ; `can_operate` suit `plan_access !== null`.
- Validators admin de plan : `tier` requis à la création, optionnel à la
  modification.
- Nouvelles routes `GET /proprio/plans`, `POST /proprio/subscription/checkout`,
  `POST /proprio/subscription/checkout/:reference/confirm`, et côté Wave
  `POST /payments/wave/subscriptions/webhook` et
  `GET /payments/wave/subscriptions/:reference/return`.
- Nouveaux codes d'erreur `subscription_required` et `plan_upgrade_required`
  (403).

### Mobile

- Compte inactif : écran « Choisir un forfait » à la place de l'accueil —
  les deux forfaits, leur contenu, un bouton Payer avec Wave. Au retour de
  Wave, appel de la confirmation puis rechargement de l'état. Un 403
  `subscription_required` reçu n'importe où ramène sur cet écran.
- Le même écran sert au renouvellement ; à 7 jours ou moins de l'échéance,
  il l'annonce à partir de `days_remaining`. Il est aussi accessible depuis le
  profil (« Forfaits »).
- Le paiement s'ouvre dans l'application Wave (`LaunchMode.externalApplication`)
  ; au retour au premier plan, l'écran appelle la confirmation.
- Le palier est lu depuis `GET /proprio/subscription` et gardé par un cubit
  d'application (`PlanCubit`), rechargé à la connexion et au retour au
  premier plan.
- Les entrées `full` restent visibles mais verrouillées : un encart
  « Disponible avec le forfait 5 000 F » remplace le contenu. Masquer les
  entrées cacherait au propriétaire ce que le forfait complet lui apporterait.
- Les refus `subscription_required` et `plan_upgrade_required` sont
  relayés par un intercepteur Dio (`PlanInterceptor` → `PlanSignals`) jusqu'au
  `PlanCubit`, sans être absorbés : le repository appelant les traduit comme
  tout autre refus. On lit le `code`, jamais le message.
- Le dernier palier connu est mis en cache (`shared_preferences`) : hors ligne,
  l'application sait quoi verrouiller dès le démarrage. Tant que rien n'est
  connu, l'accès complet est supposé — l'API reste l'autorité.
- Gérant d'un propriétaire inactif ou en `basic` : écran « Accès suspendu »,
  sans proposition de paiement.
- Synchronisation hors ligne : une saisie refusée pour `subscription_required`
  ou `plan_upgrade_required` **reste en file** (et non en conflit) — le refus
  cessera dès le paiement.
- Au forfait 3 000 F, le choix d'un client « au carnet » disparaît de la saisie
  de réservation (`GET /clients` est réservé) ; la recherche par numéro, ouverte,
  retrouve encore un habitué.

### Backoffice

Sélecteur « Palier » dans le formulaire de plan, colonne dans la liste des
plans et des abonnements. `types.ts` suit le contrat. Badge : `full` en vert,
`basic` en bleu — actif mais réduit, ni arrêté ni hors circuit.

---

## 2. Taux d'occupation

### Le défaut

Le taux rapporte les jours-logement occupés à la capacité de la **fenêtre
entière**. Sur le mois en cours, le 10, on divise par 30 jours : le taux est
mécaniquement sous-évalué d'un tiers. À l'inverse, une réservation déjà
enregistrée pour le 25 compte dans le numérateur alors que le jour n'est pas
arrivé.

### La règle

```text
taux = jours-logement occupés jusqu'à maintenant
       ÷ (jours écoulés de la fenêtre × logements exploités)
```

La fenêtre est **coupée à maintenant** — au numérateur et au dénominateur —
quand sa borne haute est dans le futur. Une fenêtre entièrement passée est
inchangée ; une fenêtre entièrement future vaut 0.

Le numérateur reste en jours occupés, pondérés par le type de séjour (une
demi-journée vaut ½). Le nombre de séjours divisé par un nombre de jours a été
écarté : un séjour d'un mois y pèserait autant qu'une nuit, et le résultat ne
serait pas un taux.

La coupe est centralisée dans une fonction de `booking_stats.ts`
(`elapsedWindow`, qui existe déjà pour les statistiques plateforme) et
appliquée partout où le taux est calculé : relevé Finance, statistiques des
réservations, relevé gérant, rapport performance PDF. Le rapport et l'écran
doivent rendre le même chiffre sur la même période.

Le filtre `residence_id` de Finance donne le taux d'une résidence ; il est
inchangé.

---

## 3. Apporteur d'affaire

Une personne qui amène un client et touche 10 % du séjour. Elle n'a pas de
compte et n'est pas forcément connue du système : c'est une saisie libre sur
la réservation, sans carnet d'apporteurs.

### Modèle

Champs optionnels sur `BookingDocument` :

```ts
referrer?: { name: string; phone: string | null } | null
/** Taux figé à la création. */
referrer_commission_rate?: number
/** Montant dû à l'apporteur, en francs, arrondi à l'unité. */
referrer_commission_amount?: number
```

Absents sur l'historique et sur toute réservation sans apporteur : lus
`null` / `0`.

### Règles

- Le taux, `REFERRER_COMMISSION_RATE = 0.10`, est **figé** sur la réservation.
  Le changer plus tard ne réécrit pas les commissions passées.
- Montant = `Math.round(total_amount × taux)`, fonction pure
  `computeReferrerCommission`.
- Recalculé, avec le taux figé, chaque fois que `total_amount` change :
  prolongation, départ anticipé. La commission suit ce que le client a
  réellement payé.
- Annulation : la réservation sort du revenu, sa commission aussi.
- Renseigné à la création seulement (comptoir, gérant, hors ligne). Le nom est
  requis si l'objet est présent ; le téléphone est normalisé comme celui d'un
  client.

### Finance

Nouveau champ `commissions` dans `summary`, réparti sur la fenêtre au prorata
des jours comme le chiffre d'affaires, et déduit du bénéfice :

```text
benefice_net = ca_brut − depenses − commissions
```

Le rapport financier PDF suit, pour rester égal à l'écran. Le relevé gérant
n'en porte pas : il n'affiche que le brut.

### Hors ligne

L'apporteur voyage avec la réservation dans `pending_bookings` et part à la
synchronisation. Le calcul du montant reste serveur : le mobile ne l'envoie
pas.

---

## 4. OCR de la pièce d'identité

- `google_mlkit_text_recognition` : reconnaissance sur l'appareil, gratuite,
  sans réseau — la saisie au comptoir doit fonctionner hors ligne.
- On photographie le **verso** et on lit la **zone MRZ** : CNI ivoirienne
  (TD1, 3 lignes de 30 caractères) et passeport (TD3, 2 lignes de 44). La MRZ
  est normalisée, ce qui la rend fiable là où la lecture du recto dépendrait
  de la mise en page de chaque pièce.
- Champs préremplis : nom complet, type de pièce, numéro. Les autres restent
  vides et modifiables, sur l'instant ou plus tard dans la fiche client.
- Si aucune MRZ n'est reconnue, rien n'est prérempli et un message invite à la
  saisie manuelle. La lecture ne bloque jamais l'enregistrement.
- La photo prise pour l'OCR devient la face arrière de la pièce.
- Le parseur MRZ est une fonction pure (chiffres de contrôle vérifiés), testée
  sans ML Kit.
- Disponible en `basic` : c'est de l'enregistrement de client.

Le numéro lu ne voyage pas dans la file hors ligne (`pending_clients` ne le
porte pas) : la photo et le nom, si ; le numéro se complète depuis la fiche.

L'écran « Nouveau client » ne créait rien : son cubit simulait l'envoi. Il est
raccordé à `POST /clients`, avec des pièces facultatives comme au comptoir.

Proposé dans la saisie de réservation (client créé à la volée) et dans l'ajout
de client.

---

## 5. Photos de la pièce sur la fiche client

`GET /proprio/clients/:id` renvoie déjà `document_front_url` et
`document_back_url`, URLs signées régénérées à chaque lecture. Le
`ClientModel` du mobile les lit ; la fiche client affiche les deux faces en
vignettes, avec zoom plein écran. Jamais mises en cache SQLite : une URL
signée expire.

Réservé au palier `full`, comme toute la fiche.

---

## 6. Facture par WhatsApp

- Bouton « Envoyer la facture » sur le détail d'un séjour.
- Le PDF est généré sur le téléphone avec `pdf`, puis partagé par
  `Printing.sharePdf` (`printing`) : feuille de partage du système, où le
  propriétaire choisit WhatsApp et le client. Les deux paquets sont déjà
  présents — aucune dépendance ajoutée — et le partage fonctionne hors ligne.
- Le lien direct `wa.me` a été écarté : il n'accepte que du texte, pas de
  pièce jointe. Le SMS aussi, pour son coût.
- Contenu : bailleur, logement et résidence, client figé
  (`client_snapshot`), dates, nombre de jours, prix journalier, remise, total,
  versements, reste dû, numéro de facture dérivé de l'identifiant.
- Réservé au palier `full` : c'est un document PDF.

---

## Contrat — récapitulatif

| Élément | API | Mobile | Backoffice |
| --- | --- | --- | --- |
| `PlanDto.tier` | ✓ | — | formulaire, liste |
| `SubscriptionDto.plan_tier` | ✓ | `PlanCubit` | liste |
| `subscription_required`, `plan_upgrade_required` (403) | ✓ | `AppFailure` dédiés | — |
| `plan_access` sur `GET /proprio/subscription` | ✓ | `PlanCubit` | — |
| `GET /proprio/plans`, checkout et confirmation Wave | ✓ | écran « Choisir un forfait » | — |
| `referrer`, `referrer_commission_*` sur la réservation | ✓ | saisie, détail, file hors ligne | détail |
| `summary.commissions` (Finance) | ✓ | écran Finance | — |

## Tests

API, suite unitaire :

- `resolvePlanAccess` : chaque ligne du tableau, replis compris, `pending`
  sans accès.
- Confirmation d'un paiement d'abonnement : session Wave relue, montant ou
  devise divergents refusés, idempotence sur un paiement déjà traité.
- `computeReferrerCommission` et son recalcul sur prolongation.
- Taux d'occupation : fenêtre passée inchangée, fenêtre en cours coupée,
  fenêtre future à zéro, réservation future exclue.
- `benefice_net` déduit des commissions, égal entre Finance et rapport.

Mobile :

- Parseur MRZ (TD1, TD3, chiffre de contrôle faux, texte sans MRZ).
- Mapping de `subscription_required` et `plan_upgrade_required` dans
  `AppFailure`.
