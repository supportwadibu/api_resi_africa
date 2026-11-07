# Choix du plan de l'essai gratuit

**Date :** 2026-11-07
**Projets touchés :** `api/`, `mobile/`, `backoffice/` (affichage seulement)
**Origine :** demande du client propriétaire de l'application.

## Intention

Aujourd'hui, un propriétaire reçoit d'office un essai de 30 jours sans plan,
qui ouvre tout Pro+. Le client veut que le propriétaire **choisisse lui-même**
le plan qu'il essaie, Pro (3 000 F) ou Pro+ (5 000 F), et qu'en fin d'essai
l'application lui propose de continuer ce plan ou de découvrir Pro+.

Rien n'est cassé dans le fonctionnement actuel : c'est un changement de
parcours commercial. Le propriétaire doit comprendre dès le départ qu'il
existe deux plans, et la fin d'essai devient un moment de vente vers Pro+.

## Objectifs

- Aucun plan n'est attribué sans le choix du propriétaire.
- Un essai porte sur le plan choisi : un essai Pro n'ouvre que ce qu'ouvre
  Pro.
- Le propriétaire ne peut rien faire d'autre dans l'application tant qu'il
  n'a pas choisi.
- À la fin de l'essai, une proposition claire : continuer avec le plan
  essayé ou passer à Pro+ (ou, si l'essai était Pro+, rester sur Pro+ ou
  passer à Pro).

## Hors périmètre

- Les rappels WhatsApp de fin d'abonnement et le rappel mensuel du rapport :
  écartés par l'utilisateur (DUGU Sender ne sait envoyer que des OTP).
- Les rappels push existants (J-7, J-3, J-0) et les tâches planifiées : on
  n'y touche pas, sauf le libellé (voir plus bas).
- La durée de l'essai : 30 jours, inchangée (`TRIAL_DURATION_DAYS`).
- Le moyen de paiement à la fin de l'essai : le parcours Wave existant
  (`subscription/checkout`) est réutilisé tel quel.

## Ce qu'il ne faut surtout pas faire

- Retirer l'accès Pro+ aux essais **déjà ouverts** : ils gardent leur accès
  complet jusqu'à leur terme.
- Laisser un propriétaire rejeté ou suspendu ouvrir un essai par le nouveau
  choix.
- Permettre un second essai : un seul par propriétaire, quel que soit le
  plan.

## Règles décidées

1. **L'essai démarre au moment du choix**, plus à la validation du code OTP.
   Les 30 jours courent à partir du choix.
2. **Un propriétaire qui ferme l'application avant de choisir** retrouve
   l'écran de choix à sa prochaine ouverture, et ne peut rien faire d'autre.
3. **Essais existants** (`plan_tier` absent) : accès Pro+ jusqu'à leur terme.
4. **Fin d'essai** : si le plan essayé était Pro, l'écran propose de
   continuer Pro ou de découvrir Pro+, en mettant en avant ce que Pro+ ajoute
   (gérants et leur interface, factures, rapports PDF). Si c'était Pro+, il
   propose de rester sur Pro+ ou de passer à Pro. Sans paiement, le
   propriétaire passe sur RESI Basic, gratuit, comme aujourd'hui.

## Ce qui change

### API

**On choisit un palier, pas un plan** *(choix de conception, pas une
demande du client)*. Un plan porte une durée (`duration_days`) : l'admin peut
créer plusieurs plans du même palier (mensuel, trimestriel). Le choix porte
donc sur le palier, `pro` ou `pro_plus`, et l'écran affiche pour chacun le
prix de son plan actif le moins cher.

**Enregistrement de l'essai.** `Subscription.startTrialOnce` prend le palier
choisi et l'inscrit dans l'essai : `plan_tier` (`pro` ou `pro_plus`),
`plan_id` restant `null`. Tout le reste reste identique, notamment la clé de
document `trial_<userId>`, qui garantit un seul essai par propriétaire. Le
montant reste 0.

**Accès pendant l'essai.** `resolvePlanAccess` lit le palier de l'essai :
`readPlanTier(plan_tier)` si renseigné, sinon `pro_plus`. Le repli couvre les
essais ouverts avant cette évolution et doit être justifié en commentaire.

**Plus d'ouverture automatique.** Supprimer l'ouverture de l'essai dans :

- `register_verify.use_case.ts` (inscription vérifiée) ;
- `google_login.use_case.ts` (première connexion Google d'un propriétaire) ;
- `validate_owner.use_case.ts` (validation du dossier par un admin) ;
- `ResolvePlanAccessUseCase.ensureTrial` (essai garanti au premier accès).

Un propriétaire sans aucun abonnement, jamais essayé, reçoit le palier
`free` du point de vue de l'API. C'est l'application qui le retient sur
l'écran de choix.

**Nouvelle route** `POST /api/v1/proprio/subscription/trial`, corps
`{ tier: 'pro' | 'pro_plus' }` (validé par VineJS), derrière `auth()` et le
rôle `proprio`, avec une limite de débit par compte. Use case
`StartTrialForOwnerUseCase`, étendu :

| Cas | Réponse |
| --- | --- |
| Essai ouvert | `201 { data: SubscriptionDto }` |
| Aucun plan actif de ce palier | `DomainError('plan_not_available', …, 422)` |
| Propriétaire rejeté ou suspendu | `DomainError('trial_not_allowed', …, 403)` |
| Déjà un abonnement, essai compris, présent ou passé | `DomainError('trial_already_used', …, 409)` |

Les propriétaires dont le dossier est en attente (`pending`) peuvent ouvrir
leur essai : c'est le cas normal, l'essai sert à découvrir l'application
pendant l'examen du dossier.

**Statut d'abonnement.** `GET /proprio/subscription` gagne un champ
`trial_choice_required: boolean` : vrai quand le propriétaire n'a jamais eu
d'abonnement et n'est ni rejeté ni suspendu. Le mobile s'appuie dessus, pas
sur une règle recalculée de son côté. Pendant l'essai, son palier est dans
`subscription.plan_tier`.

Elle gagne aussi `ended_trial_tier: 'pro' | 'pro_plus' | null` *(choix de
conception)* : le palier de l'essai quand celui-ci est échu et qu'aucun
abonnement payé n'a pris le relais, `null` sinon (`pro_plus` pour un essai
échu sans `plan_tier`). Nécessaire parce qu'un essai échu n'est plus renvoyé
comme abonnement en cours : sans ce champ, l'écran de fin d'essai ne saurait
pas quel plan proposer.

**Validation d'un dossier.** `ValidateOwnerUseCase` n'ouvre plus d'essai :
`trial_started` vaut toujours `false` et `trial_end_date` vaut `null`. Les
champs restent dans la réponse pour ne pas casser le back-office.

**Suspension en fin d'essai** (`SuspendUnverifiedOwnersUseCase`) : inchangée.
Un propriétaire qui n'a jamais choisi n'a pas d'essai, donc rien à
suspendre ; il est de toute façon bloqué sur l'écran de choix.

**Libellé des rappels** (`subscription_reminder.ts`) : pour un essai,
nommer le plan essayé (« Votre essai Pro se termine… »), avec le repli
actuel si `plan_tier` est absent.

**Tests unitaires** à couvrir : palier d'un essai Pro et d'un essai Pro+,
repli Pro+ d'un essai sans `plan_tier`, refus des cas du tableau,
`trial_choice_required` dans chaque situation.

### Mobile

**Écran de choix du plan d'essai** (nouveau, feature `subscription`). Les
deux plans côte à côte, chargés depuis l'API (prix, nom, fonctions), avec le
même vocabulaire visuel que l'écran des forfaits. Un bouton par plan :
« Essayer Pro gratuitement » et « Essayer Pro+ gratuitement ». Mention
« 30 jours offerts, sans engagement ». Erreurs affichées dans l'écran.
Après succès, l'écran de bienvenue existant (`TrialWelcomeScreen`), qui
nomme maintenant le plan choisi.

**Placement dans le parcours.** L'écran de choix remplace l'arrivée directe
sur `TrialWelcomeScreen` après le dépôt des pièces. Le garde global de
`app.dart` qui renvoie déjà vers les forfaits pour un compte inactif est
étendu : si `trial_choice_required` est vrai, l'application remplace toute
la pile par l'écran de choix. Ce garde couvre aussi la connexion Google, la
reconnexion et le retour au premier plan. Il ne s'applique qu'au rôle
`proprio` : un gérant dépend de l'abonnement de son propriétaire et n'a rien
à choisir.

**Écran de fin d'essai** (nouveau). Affiché une fois, à la première ouverture
où `ended_trial_tier` est renseigné. Selon le plan essayé :

- essai Pro : « Continuer avec Pro » et « Découvrir Pro+ », qui détaille ce
  que Pro+ ajoute ;
- essai Pro+ : « Rester sur Pro+ » et « Passer à Pro ».

Chaque bouton ouvre l'écran des forfaits existant (`SubscriptionPlansScreen`)
avec le palier visé mis en avant ; le choix de la durée et le paiement Wave y
restent tels quels. Un lien discret « Continuer avec RESI Basic, gratuit »
ferme l'écran.

**Textes** dans `assets/translations/fr.json` et `en.json`. Les textes
actuels qui promettent « Accès complet à toutes les fonctions » pendant
l'essai sont à reformuler, puisque ce n'est plus vrai pour un essai Pro.

### Back-office

Afficher le plan d'un essai là où un essai apparaît (`abonnements`, fiche
`comptes/[id]`) : « Essai · Pro » ou « Essai · Pro+ ». Les essais sans plan
s'affichent « Essai · Pro+ ». Le message affiché après la validation d'un
dossier ne doit plus annoncer qu'un essai a été ouvert.

## Contrat d'API : ce qui change pour les clients

- Nouvelle route `POST /proprio/subscription/trial`.
- Nouveaux champs `trial_choice_required` et `ended_trial_tier` dans
  `GET /proprio/subscription`.
- Trois nouveaux codes d'erreur : `plan_not_available`, `trial_not_allowed`,
  `trial_already_used`.
- `POST /admin/owners/:id/validate` n'ouvre plus d'essai.
- `backoffice/src/lib/api/types.ts` à mettre à jour.

**Déploiement.** L'API et le mobile partent ensemble. Une version mobile
antérieure ne connaît pas l'écran de choix : avec la nouvelle API, ses
nouveaux inscrits n'auraient aucun essai. L'application n'étant pas encore
publiée sur le Play Store, le risque se limite aux installations de test.

## Laissé au constructeur

- Le nom exact des fichiers, écrans et clés de traduction, selon les
  conventions du dépôt.
- La mémorisation « écran de fin d'essai déjà vu » : préférence locale par
  identifiant d'utilisateur, à choisir parmi les stockages existants.
- La mise en page précise des deux écrans, dans le système visuel existant
  (`AppCard`, `AppButton`, `Section`, jetons du thème).
- La limite de débit exacte de la nouvelle route.
