# Refonte UI/UX du mobile sur le système du backoffice

Date : 2026-09-26 · Projet : `mobile/` · Référence : `backoffice/src/app/globals.css`,
`backoffice/src/components/`.

## Intention

Une seule identité visuelle pour RESI. Le mobile abandonne sa charte propre
(violet `#3322AC`, dégradé vert→violet, fonds lavande, arrondis de 8 à 32 px,
ombres portées, verre dépoli) et reprend **strictement** la grammaire du
backoffice : noir et blanc, angles droits, accents réservés aux chiffres,
icônes et badges, Geist, Lucide.

Deuxième objectif : rendre le mode sombre réel. `ThemeMode.system` était
déclaré, mais `AppColors` ne portait que des constantes claires et 137
fichiers codaient des teintes en dur.

Hors périmètre : les parcours métier (saisie comptoir, ajout de bien,
abonnement…) gardent leurs étapes. La structure des écrans, elle, s'aligne.

## Jetons — `lib/core/theme/resi_tokens.dart`

`ResiTokens extends ThemeExtension<ResiTokens>`, deux instances `light` et
`dark`, valeurs recopiées de `globals.css` (source de vérité : un changement
de teinte côté web se reporte ici à la main).

| Jeton | Clair | Sombre |
|---|---|---|
| `background` | `#FAFAFA` | `#000000` |
| `surface` | `#FFFFFF` | `#121212` |
| `foreground` | `#0A0A0A` | `#FAFAFA` |
| `muted` | `#5F5F66` | `#A1A1A8` |
| `border` | `#E5E5E8` | `#27272A` |
| `primary` / `primaryForeground` | `#0A0A0A` / `#FFFFFF` | `#FAFAFA` / `#0A0A0A` |
| `accentViolet` / `Soft` | `#6D28D9` / `#F3EFFD` | `#A78BFA` / `#231A3A` |
| `accentGreen` / `Soft` | `#15803D` / `#ECF8F0` | `#4ADE80` / `#0F2A1A` |
| `accentRed` / `Soft` | `#B42318` / `#FEF3F2` | `#FDA29B` / `#3A1512` |
| `accentBlue` / `Soft` | `#1D4ED8` / `#EEF3FE` | `#93B4FD` / `#14203D` |
| `accentAmber` / `Soft` | `#B45309` / `#FDF6E9` | `#FBBF24` / `#33240A` |
| `overlay` / `onOverlay` | `#000000` / `#FFFFFF` | idem |

`danger` / `dangerSurface` sont les alias du rouge. Accès : `context.tokens`.
`AppAccent { neutral, violet, green, red, blue, amber }` et
`tokens.accent(a)` / `tokens.accentSoft(a)` servent les tuiles et badges.

## Thème — `lib/core/theme/app_theme.dart`

`ColorScheme` construit explicitement depuis les jetons (plus de
`colorSchemeSeed`). Chaque thème de composant Material est posé une fois,
angles droits : AppBar, boutons, champs, dialogues, feuilles, SnackBar,
chips, sélecteurs de date et d'heure, Divider, Switch, Checkbox, Radio,
ListTile, NavigationBar, TabBar, progression. Un widget Material non migré
prend déjà la bonne allure.

## Typographie

Geist embarquée (`assets/fonts/geist/`, 400/500/600/700, licence OFL) — pas
de `google_fonts` : la saisie comptoir fonctionne hors réseau, police
comprise. `TextTheme` calé sur l'échelle Tailwind du backoffice :

| Rôle | Style `TextTheme` | Taille / graisse |
|---|---|---|
| Titre d'écran (`text-2xl`) | `headlineSmall` | 24 / 600 |
| Titre de barre, de feuille | `titleLarge` | 18 / 600 |
| Titre de section | `titleMedium` | 16 / 600 |
| Libellé fort | `titleSmall` | 14 / 500 |
| Corps (`text-sm`) | `bodyMedium` | 14 / 400 |
| Note, libellé secondaire (`text-xs`) | `bodySmall` | 12 / 400, `muted` |
| Bouton | `labelLarge` | 14 / 500 |
| Badge | `labelSmall` | 12 / 500 |

Chiffres clés et montants : 24 / 600 en chiffres tabulaires
(`AppText.figure`) ; tout montant en colonne porte `tabularFigures`.

## Formes, profondeur, mouvement

- **Arrondis** (révisé le 2026-09-30, à la demande — la version d'origine
  était à angles droits partout, comme le backoffice, qui le reste). Une
  échelle unique, `AppRadius` (`lib/core/theme/app_radius.dart`) : `xs` 6
  badges, cases et squelettes ; `sm` 8 pastilles d'icône, boutons icône,
  vignettes ; `md` 12 boutons, champs, cartes, sections, encarts, toasts ;
  `lg` 20 feuilles (coins hauts), dialogues, carte flottante ; `pill` puces,
  badges, jauges, avatars (disques), barre des onglets. Un filet de
  séparation (bord haut ou bas seul) reste droit. Là où ce document dit
  « carré » d'un composant, lire « arrondi selon `AppRadius` ».
- **Pas d'ombre sur le contenu** : une bordure `border` d'un pixel sépare.
  Seul ce qui flotte (feuille du bas, menu, toast) garde une ombre unique
  (`AppElevation.floating`). Plus de dégradé. `BackdropFilter` réservé à la
  coque de l'accueil (`FrostedSurface`, voir « Coque »).
- **Espacement** : `AppSpacing` (4/8/16/24/32) conservé, gouttière d'écran
  16.
- **Mouvement** : `AppDurations` conservé ; pas de rebond (`easeOutBack` →
  `easeOutCubic`).

## Icônes

`lucide_icons_flutter` remplace FontAwesome et les Material Icons. Une section
garde la même icône partout (`AppSectionIcons`, miroir de `SECTION_ICONS`) :

| Section | Icône |
|---|---|
| Accueil | `layoutDashboard` |
| Réservations | `calendarCheck` |
| Biens | `bedDouble` |
| Résidences | `building2` |
| Clients | `users` |
| Dépenses | `receipt` |
| Statistiques / finances | `chartColumn` |
| Rapports | `fileText` |
| Gérants | `userCog` |
| Abonnement | `creditCard` |
| Support | `lifeBuoy` |
| Avis | `messageSquare` |
| Profil | `circleUser` |

Actions : `plus` créer, `pencil` modifier, `trash2` supprimer, icône avant le
libellé. Taille 16 dans le texte, 20 dans une barre.

## Statuts — `lib/shared/widgets/status_badge.dart`

Portage de `STATUS_TONES` : vert abouti/en règle, violet en cours, bleu
planifié, ambre en attente d'action, rouge arrêté par une décision, neutre
hors circuit. Tables par famille (réservation, bien, abonnement, synchro
hors ligne, client). Tout statut, même calculé dans un écran, passe par
`StatusBadge` / `AppBadge`.

## Composants partagés — `lib/shared/widgets/`

| Mobile | Miroir backoffice | Notes |
|---|---|---|
| `AppButton` | `Button` | `primary`, `secondary`, `danger`, `ghost` ; `md`, `sm` ; `icon` avant le libellé ; `expand` pleine largeur ; `isLoading` |
| `AppIconButton` | `IconButton` | `label` en infobulle et sémantique, `tone: danger` |
| `AppTextField` & co. | `Input` | libellé 14/500 au-dessus, champ carré, bordure `border`, focus `foreground` |
| `AppTopBar` | en-tête | barre des écrans empilés : titre à gauche, retour `chevronLeft`, filet bas |
| `PageHeader` | `PageHeader` | titre 24/600 des onglets racines, description, actions |
| `Section` | `Section` | bloc bordé titré, icône optionnelle, actions |
| `DetailList` / `DetailRow` | `DetailList` | libellé `muted` / valeur |
| `StatTile` | `StatTile` | chiffre clé, pastille d'accent carrée, note tonale, `onTap` |
| `Breakdown` | `Breakdown` | répartition en jauges |
| `AppBadge`, `StatusBadge` | `Badge` | |
| `EmptyState`, `ErrorState` | `EmptyState`, `ErrorPanel` | icône sur pastille carrée neutre |
| `showConfirmDialog` | `ConfirmDialog` | action asynchrone, erreur affichée dans le dialogue, `danger` focalise « Annuler » |
| `showAppSheet` | `Dialog` / `FormDialog` | feuille du bas carrée, titre, poignée |
| `AppToast` | `notify` | toast carré, bordure, icône teintée par le ton |
| `AppLoader` | — | indicateur fin, couleur `foreground` |
| `AppCallout` | `ScopeNote` | encart d'état : fond d'accent doux, icône, titre, message, action |
| `AppCard`, `IconChip` | — | bloc bordé ; pastille carrée d'icône sur accent doux |
| `AppSheetAction`, `AppChoiceChip`, `AppOptionTile` | — | ligne d'action de feuille ; puce de choix multiple (noire une fois choisie) ; carte de choix unique (filet `primary`) |
| `AppPickerField` | `Input` | champ qui ouvre un sélecteur (date, période) |
| `AppLogo` | `Logo` | inversé en sombre, `onMedia` sur photo |
| `ThemeSwitcher` | `ThemeSwitcher` | clair / sombre / système |

Règle : un écran ne dessine ni bouton, ni carte, ni badge à la main — il
compose ces widgets.

## Décisions prises à l'implémentation

- **Forfaits** : tons de `PLAN_TIER_TONES` — essai violet (en cours),
  enregistrement bleu, complet vert (en règle). Le dégradé Premium disparaît.
- **Catégories de dépense** : couleur tirée des jetons (`colorIn(tokens)`) —
  cinq accents plus trois neutres pour huit postes.
- **Chargeur** : anneau fin à la couleur du texte ; l'animation Lottie, de la
  couleur de marque, est retirée avec la dépendance.
- **Connexion / inscription** : photo et accroche en haut sur voile `overlay`,
  formulaire sur le fond de page — transposition verticale de la page de
  connexion du backoffice.
- **Succès** : fondu et glissement, sans rebond ni ondes.
- **Commandes sans effet retirées** : recherche inerte, filtre non lu et
  suppression factice de l'onglet « Mes biens » (la recherche devient locale,
  sur le nom et la ville) ; interrupteur « Notifications » du profil, qui
  n'enregistrait rien, remplacé par le choix d'apparence.
- **FontAwesome** conservé pour le seul logo WhatsApp, absent de Lucide.

## Coque

- `NavigationBar` **flottante** (retour sur la première version de la
  refonte, à la demande) : décollée des bords de 16, posée sur une
  `FrostedSurface` — fond `surface` translucide, flou, filet `border`, en
  pilule. L'accueil passe en `extendBody` : le contenu défile sous la barre,
  et les onglets tirent leur marge basse de `MediaQuery.paddingOf`. Quatre
  destinations (Accueil, Réservations, Biens, Stats) aux icônes de section,
  indicateur en pilule `background`.
- Bouton « + » : disque, à droite de la barre, même surface floutée ; plein
  `primary` menu ouvert, le « + » pivote en croix. Il ouvre la
  `FloatingActionCard` (rayon `lg`, liste d'actions filtrée par le rôle) au-dessus de la
  barre, en fondu, glissement et léger agrandissement, sans rebond ; un voile
  `overlay` léger couvre le contenu, un appui dessus ou le retour système
  referme.
- Onglets racines : `PageHeader` en tête de contenu. Écrans empilés :
  `AppTopBar`.
- Profil : bascule d'apparence Clair / Sombre / Système
  (`SegmentedButton`), mémorisée dans `shared_preferences` sous `resi_theme`
  (miroir du cookie du backoffice) par `ThemeController`.

## Structure des écrans

- Fond d'écran `background`, blocs `surface` bordés.
- Liste : `PageHeader` / `AppTopBar`, recherche et filtres, lignes séparées
  par un filet (pas de cartes flottantes espacées), `EmptyState`.
- Fiche : en-tête (titre, statut, actions), puis `Section`s de `DetailList`.
- Formulaire : champs empilés à 16, actions en barre basse
  (`AppBottomActionBar`) — bouton `primary` pleine largeur.
- Tableau de bord : grille de `StatTile` 2 colonnes, `Breakdown`, sections.

## Transition

Chaque lot compile et passe `flutter analyze`. `AppColors`, `AppRadius`,
`AppShadows` et `AppTextStyles` disparaissent au terme de la migration ;
FontAwesome est retiré du `pubspec`.

Lots : 1 fondations (jetons, thème, police, icônes, composants) · 2 coque ·
3 écrans par feature (accueil/stats, réservations, biens/résidences, clients,
dépenses/rapport, gérants, abonnement, auth/profil, support/avis).

## Vérification

`flutter analyze` sans erreur ; `flutter test` au vert ; relecture de chaque
écran en clair et en sombre ; `grep` final : aucune `Color(0x` hors
`core/theme`, aucun `BorderRadius.circular`, aucun `FontAwesome`.
