# App client — lot 1 : découvrir et réserver

Date : 2026-10-08 · Projets : `client/` (Flutter), `api/` (AdonisJS)

## Objectif

Une application client utilisable de bout en bout sur l'API existante :
découvrir des résidences sur une carte et en cartes à faire glisser, ouvrir
une fiche, réserver des dates et payer par Wave, retrouver ses réservations.

Le lot 1 est le premier des cinq lots tirés de la vision du concepteur
(document « RESI — Vision de l'app client ») :

| Lot | Contenu |
| --- | --- |
| **1** | **Découvrir et réserver** (ce document) |
| 2 | Notes et avis, filtres par équipement, recherche par rayon côté API |
| 3 | Séquestre, code d'arrivée, acompte 50 %, réservations impayées |
| 4 | Discussion client–propriétaire, filtrage des coordonnées, lien de paiement |
| 5 | Boosts, visuels IA, AdMob, push, notification de proximité |

## Décisions

| Sujet | Décision |
| --- | --- |
| Compte | Parcourir, aimer, consulter sans compte. Connexion exigée au paiement. |
| Accueil | Carte plein écran façon Yango + feuille ancrée « À la une » |
| Moteur de carte | Google Maps (`google_maps_flutter`), style JSON clair et sombre |
| Cartes à glisser | Photo plein cadre, texte sur voile sombre |
| Gestes | Gauche = non, droite = j'aime, toucher ou bouton → = fiche |
| Navigation | Menu ☰ (tiroir), pas de barre d'onglets |
| Connexion | Téléphone ou e-mail + mot de passe + OTP, et Google |
| Notes | Aucune au lot 1 : « À la une » remplace « Les mieux notées » |
| Favoris | Sur le téléphone (SharedPreferences), pas de route API |
| Paiement | Wave, montant intégral, application Wave ouverte en externe |
| Style | Design system de l'app propriétaire : `ResiTokens`, `AppButton`, Geist, Lucide |

## Parcours et écrans

1. **Accueil (`explore`).** Carte Google stylée plein écran, centrée sur le
   client si la localisation est autorisée, sinon sur Abidjan. Une pastille de
   prix par résidence (« 25 000 F »), grossie au toucher. Point bleu pour le
   client. Boutons flottants ☰ (tiroir) et ◎ (recentrer, ou demander la
   permission). Feuille ancrée sur trois hauteurs : champ « Où souhaitez-vous
   séjourner ? » puis carrousel « À la une » (route `featured`). C'est le point
   d'entrée du client hors de Côte d'Ivoire, sans position connue.
2. **Recherche (`search`).** Écran plein : destination avec suggestions de
   villes et communes et « Autour de moi » ; options rapides *Quand* (Ce soir,
   Ce week-end, Choisir) et *Type* (Studio, Appartement, Villa, Duplex) ;
   bouton « Voir N résidences ». Le bouton ⚙ ouvre une feuille de filtres :
   budget par jour, chambres minimum, surface minimum, tri (Plus proches, Prix
   croissant). Seuls des filtres que l'API applique déjà.
3. **Cartes à glisser (`discover`).** Pile de cartes photo plein cadre :
   points de pagination des photos (toucher à gauche ou à droite de la photo
   pour défiler), badge « À la une » le cas échéant, titre, commune,
   chambres, distance, prix par jour. Trois boutons : ✕ (non), ♥ (j'aime),
   → (fiche, noir). Bouton 🗺 pour revenir à la carte avec les mêmes résultats.
4. **Fiche (`property`).** Galerie plein écran, chiffres clés (chambres, salles
   de bain, surface), équipements, description, mini-carte à position
   approximative, barre fixe « 40 000 F / jour · Réserver ». Aucune coordonnée
   du propriétaire : la règle anti-contournement vaut dès le lot 1.
5. **Réservation (`booking`).** Feuille : calendrier aux dates occupées
   barrées, récapitulatif (prix × jours, remise de palier, code promo, total),
   « Payer avec Wave ». La garde de connexion intervient ici ; après connexion,
   retour sur la feuille avec les dates conservées.
6. **Retour de Wave.** L'app revient au premier plan, appelle `confirm`, puis
   affiche le reçu « Réservation confirmée ». Échec : message et « Réessayer ».
7. **Tiroir ☰.** Avatar et nom, ou « Se connecter » ; Mes réservations, Mes
   favoris, Profil, Apparence et langue, Déconnexion.

## Architecture de l'app client

```text
lib/features/
  explore/     accueil carte, ExploreCubit (À la une + position)
  search/      écran de recherche, feuille de filtres, SearchQuery, SearchCubit
  discover/    pile de cartes, gestes, tampons, haptique
  property/    fiche, PropertyRepository, PropertyModel
  booking/     feuille de réservation, StayPrice, BookingCubit, retour Wave, reçu
  bookings/    historique « Mes réservations »
  favorites/   favoris locaux, FavoritesCubit
  auth/        connexion, inscription + OTP, Google ; AuthRepository, AuthService
  profile/     profil, apparence, langue
lib/core/
  location/    LocationService (geolocator) : permission, position, distance
  auth/        TokenStore (secure storage), AuthInterceptor (jeton + refresh)
  router/      routes, AuthGuard posé sur le paiement
lib/shared/widgets/
  AppDrawer, PricePill
```

L'écran `home` actuel, provisoire, est remplacé par `explore`.

- **Recherche partagée.** `SearchCubit` est un singleton de session : il porte
  la `SearchQuery` et la liste paginée. La carte et la pile lisent la même
  liste ; basculer de l'une à l'autre ne relance aucune requête.
- **Intercepteurs Dio**, dans l'ordre : connectivité, authentification (jeton,
  rafraîchissement mutualisé), rejeu, journal. Les routes publiques partent
  sans jeton si aucune session n'existe.
- **Clé Google Maps** fournie au build (`--dart-define=GOOGLE_MAPS_API_KEY`,
  reportée dans le manifeste Android et l'`AppDelegate` iOS), jamais commitée.
- **Dépendances ajoutées**, chacune justifiée dans le `pubspec.yaml` :
  `google_maps_flutter`, `geolocator`, `flutter_secure_storage`,
  `url_launcher`, `google_sign_in`, `cached_network_image`.
- **Animations des cartes faites à la main** (`GestureDetector`,
  `AnimationController`, simulation de ressort), sans paquet de swipe tiers.

## Changements côté API

### Corrections

1. **Inscription admin.** `registerInitValidator` accepte aujourd'hui
   `role_name: "admin"` : n'importe qui peut créer un compte administrateur.
   `admin` est retiré de l'énumération. Les administrateurs restent créés par
   `BOOTSTRAP_ADMINS` et `admin:create`.
2. **Authentification des routes client.** Le groupe `/client` n'a pas de
   middleware : `ctx.authUser` n'y est jamais renseigné et les réservations
   renvoient toujours 401. Le groupe est scindé : `properties` reste public,
   `bookings` passe sous `auth()` + `role(['client'])`.
3. **Webhook Wave des réservations.** La signature est vérifiée sur
   `JSON.stringify(body)`, qui ne reproduit pas les octets signés. Aligné sur
   le webhook des abonnements : vérification sur `ctx.request.raw()`.

### Ajouts

4. **`GET /client/properties/:id/availability`** (public). Périodes occupées
   d'une résidence publiée : `[{ start, end }]`, sans identifiant de
   réservation ni nom de client. 404 `property_not_found` si la résidence
   n'est pas publiée.
5. **Retour de Wave**, sur le modèle des abonnements :
   - `GET /payments/wave/bookings/:reference/return?outcome=success|error` :
     page minimale invitant à revenir dans l'application. `successUrl` et
     `errorUrl` de `InitializeBookingPaymentUseCase` y pointent désormais.
   - `POST /client/bookings/:id/payments/wave/confirm` (client authentifié) :
     relit la session chez Wave et enregistre le paiement sans attendre le
     webhook. Rend `{ data: BookingPaymentDto }`, dont le `status` existant
     (`pending`, `success`, `failed`, `cancelled`, `expired`) dit l'issue.
     Idempotent : un paiement déjà constaté est rendu tel quel.

### Hors lot 1

Une réservation en ligne naît `confirmed` avant tout paiement : une
réservation jamais payée bloque ses dates. Traité au lot 3 avec le séquestre.

### Impact sur les autres clients

Aucun DTO existant ne change. Le mobile propriétaire et le backoffice ne sont
pas touchés. Seul changement de comportement : l'inscription refuse
`role_name: "admin"`.

## Flux, états et erreurs

- **États** des cubits : hiérarchie `sealed` `Initial` / `Loading` / `Loaded` /
  `Error`, `if (!isClosed)` avant tout `emit` suivant un `await`.
- **Pagination** : 20 résultats par page ; la pile précharge la page suivante
  quand il reste 5 cartes.
- **Tri « Plus proches »** : fait sur le téléphone, sur les résultats chargés
  (la recherche par rayon côté API relève du lot 2).
- **Prix** : `countStayDays` (jours = fin − début) et la remise de palier sont
  portés en Dart (`StayPrice`) et testés sur les mêmes cas que l'API. Le
  montant qui fait foi est celui de la réservation créée ; s'il diffère de
  l'estimation (promo refusée, prix changé), il est affiché avant d'ouvrir
  Wave.
- **Paiement** : création de la réservation, `initializeWave`, ouverture de
  l'application Wave, puis au retour au premier plan `confirm`. `success` :
  reçu ; `failed`, `cancelled`, `expired` : échec et « Réessayer » (nouvelle
  session Wave). `pending` : trois nouvelles tentatives à délai croissant, puis écran
  « Paiement en cours de vérification » ; la réservation apparaît « en
  attente » dans l'historique.
- **Erreurs** : le repository convertit en `AppFailure` ; l'écran lit
  `statusCode` ou `code`, jamais le texte.
  - 409 à la création : dates prises entre-temps → disponibilité rechargée,
    calendrier rouvert, message de l'API affiché.
  - 401 : rafraîchissement par l'intercepteur ; en cas d'échec, connexion puis
    retour à la feuille de réservation.
  - Hors réseau : bandeau et « Réessayer ». Pas de mode hors ligne au lot 1.
- **Localisation refusée** : carte centrée sur Abidjan, aucune redemande
  automatique ; ◎ propose la permission.

## Animations

- **Cartes** : la carte suit le doigt avec une rotation proportionnelle au
  déplacement horizontal ; le tampon (NON, J'AIME) apparaît en fondu dès 30 %
  du seuil ; retour haptique léger au franchissement. Lâchée au-delà du seuil
  ou par un geste vif, elle part avec l'élan ; sinon retour en ressort. La
  carte suivante remonte de l'arrière-plan. Les boutons jouent la même
  animation.
- **Carte** : pastille grossie au toucher, recentrage animé de la caméra.
- **Feuille d'accueil** : trois hauteurs d'ancrage, glissement libre entre
  elles.

## Tests

- **API (Japa)** : fonctionnels — 401/403 sur `bookings`, `properties`
  public, refus de `role_name: "admin"`, disponibilité sans données
  personnelles, page de retour ; unitaires — interprétation de la session Wave
  dans la confirmation.
- **Client (flutter_test)** : unitaires — `StayPrice`, `SearchQuery` en
  paramètres d'URL, tri par distance, transitions de `BookingCubit` (dont 409
  et `pending`), conversion en `AppFailure` ; widgets — pile de cartes (choix
  au-delà du seuil, retour en deçà), feuille de réservation (dates barrées,
  total), garde de connexion.
- **Vérification manuelle** sur appareil : rendu Google Maps clair et sombre,
  aller-retour réel vers Wave.

## Prérequis

- Clé Google Maps restreinte aux packages Android et iOS `africa.resi.client`.
- App client déclarée dans Firebase (SHA-1 Android, bundle id iOS) pour
  Google Sign-In.

Sans eux, la carte reste vide et le bouton Google est masqué ; le reste de
l'application fonctionne.

## Livraison

Deux dépôts, dans l'ordre : `api/` puis `client/`. Commits sur demande.
