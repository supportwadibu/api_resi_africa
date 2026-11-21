# Backoffice au système de design des applis — design

Date : 2026-11-19 · Dépôt concerné : `backoffice/`

## Intention

Le backoffice (Next.js, rôle `admin`) est resté en noir et blanc, Geist, à
angles droits, alors que les deux applis mobiles ont adopté en novembre 2026
un nouveau système : fond crème / prune, deux accents de surface lavande et
sable, Urbanist, arrondis, pilules et verre. L'utilisateur veut que le
backoffice porte la **même identité** que les applis.

## Approches

- **A. Même identité, mise en page conservée** — jetons, police, arrondis et
  tous les composants refaits ; les pages gardent leur structure et les
  tableaux leur densité. **Retenue par l'utilisateur.**
- B. Refonte complète comme sur mobile (disposition des écrans refaite page
  par page, tableau de bord en carte lavande et grille de tuiles). Écartée :
  plus longue, et les gabarits mobiles (titres 30-36, cartes `lg`) coûtent
  trop de place sur des tableaux denses.
- A + tableau de bord façon B (recommandation initiale). Écartée par
  l'utilisateur : A seul.

## Objectifs

- Les 27 pages prennent l'allure des applis sans que leur balisage change :
  le travail porte sur `globals.css`, `layout.tsx`, `src/components/` et
  `src/components/shell/`.
- Clair et sombre restent tous deux lisibles, avec le même mécanisme
  (`light-dark()`, cookie `resi_theme`, `data-theme`).

## Hors sujet

- Aucune page réorganisée, aucun écran nouveau, aucune fonction ajoutée.
- Pas de changement de contrat avec l'API ni de logique (server actions,
  `proxy.ts`, cookies).

## À éviter (échec même si « ça marche »)

- Tableaux moins denses : hauteur de ligne et taille de texte des tableaux
  conservées.
- Plus de deux accents de surface (lavande, sable) ; vert, ambre, rouge,
  bleu restent aux badges de statut et aux petites pastilles.
- Formes décoratives visibles ; la lueur prune du mode sombre reste un halo
  discret.
- Teinte littérale ou `border-radius` écrit à la main dans un composant :
  tout passe par les jetons.

## Décisions

**Couleurs** — `globals.css` reprend à l'identique les valeurs de
`mobile/lib/core/theme/resi_tokens.dart`, sous les noms actuels :

| Jeton | Clair | Sombre |
| --- | --- | --- |
| background | `#FBF6F0` | `#07050B` |
| surface | `#FFFFFF` | `#16101C` |
| foreground | `#0B0B0F` | `#F5F3F7` |
| muted | `#625C6A` | `#B0A8BA` |
| border | `#E7DED3` | `#2A2232` |
| primary / primary-foreground | `#0B0B0F` / `#FFFFFF` | `#F5F3F7` / `#0B0B0F` |
| accent-violet / -soft | `#4B3FC4` / `#ECE8FF` | `#C9C2FF` / `#2A2340` |
| accent-green / -soft | `#15803D` / `#E8F5EC` | `#4ADE80` / `#0F2A1A` |
| accent-red / -soft | `#B42318` / `#FEF3F2` | `#FDA29B` / `#3A1512` |
| accent-blue / -soft | `#3B4FC4` / `#ECEFFE` | `#B4C0FF` / `#1C2140` |
| accent-amber / -soft | `#8A5A00` / `#FDE9B9` | `#FDE9B9` / `#3A2E14` |

Jetons ajoutés : `lavender` `#C9C2FF` / `on-lavender` `#14112A`, `sand`
`#FDE9B9` / `on-sand` `#2E2205` (identiques dans les deux modes) ; `glass`
(`#FFFFFFC7` / `#241A2E8C`) et `glass-border` (`#FFFFFFF2` / `#FFFFFF1F`) ;
`glow` `#2E1838` en sombre, en halo radial depuis le coin haut gauche du
`body`, transparent en clair.

**Police** — Urbanist (`next/font/google`, auto-hébergée au build) remplace
Geist Sans ; chiffres en `tabular-nums`. Geist Mono reste pour les
identifiants et le journal d'audit.

**Arrondis** — la règle « aucun arrondi » est levée. Échelle de Tailwind
remplacée par celle d'`AppRadius` : `xs` 8 (badges carrés, cases à cocher,
squelettes), `sm` 14 (pastilles, vignettes), `md` 20 (champs, cartes,
sections, conteneurs de tableau, toasts, liste des `<select>`), `lg` 30
(dialogues), `full` (boutons, puces, badges, boutons icône, avatars,
pagination). Rien d'autre.

**Composants**

- `Button` / `ButtonLink` / `IconButton` : pilule ou disque ; variantes et
  tailles inchangées.
- `Input`, `Select`, `Checkbox` : rayon `md` (cases `xs`), fond `surface`.
- `Badge` / `status-badges` : pilule, grammaire `STATUS_TONES` inchangée.
- `StatTile` : carte `md`, pastille d'icône en disque ; nouvelle prop
  `surface` (`lavender` | `sand` | `neutral`, défaut `neutral`) pour la teinte
  de fond, distincte de `accent` qui reste la couleur de la pastille.
  Le tableau de bord peut passer `surface` à ses tuiles existantes sans
  changer leur disposition.
- `Breakdown` : jauges en pilule.
- `PageHeader`, `Section`, `DetailList`, `EmptyState`, `ErrorPanel`,
  `ScopeNote`, `PhotoGallery` : cartes `md`, pastilles d'icône en disque ;
  structure inchangée.
- `Table` : conteneur `md` bordé, en-tête en texte secondaire, survol de
  ligne sur `background` ; densité inchangée.
- `Dialog` / `FormDialog` / `ConfirmDialog` : rayon `lg`, fond flouté.
  Reste un `<dialog>` (pas de feuille du bas : c'est un écran de bureau).
- Toasts Sonner : carte de verre `md`, disque coloré selon le ton, comme
  `AppToast`.
- Shell : barre latérale posée sur le fond, sans filet ; lien actif en
  pilule `primary`. En-tête en verre (`glass` + flou) quand il recouvre le
  contenu. Menu mobile et menu utilisateur : cartes `md`.
- Graphiques des revenus : courbe `accent-violet`, aire en dégradé lavande,
  grille sur `border`.

**Documentation** — la section « Thème » du backoffice dans `CLAUDE.md`
(noir et blanc, « Aucun arrondi ») est réécrite selon ce document.

## Laissé au constructeur

- Valeurs exactes de flou, d'ombre des dialogues et de la liste des
  `<select>`.
- Ordre des composants et découpage en commits.
- Vérification : `npm run lint`, `npx tsc --noEmit`, `npm run build`, puis
  captures clair et sombre de la connexion, du tableau de bord, d'une liste,
  d'une fiche et d'un dialogue.
