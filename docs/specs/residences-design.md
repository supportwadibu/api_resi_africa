# Résidences et unités louables — design

**Date :** 2026-09-12
**Périmètre :** `api_resi` (AdonisJS + Firestore) et `resi_africa` (Flutter)

## Objectif

Une résidence peut abriter plusieurs logements loués séparément. « Resi Adja »
compte par exemple un studio 1, un studio 2 et une chambre-salon, chacun avec
son tarif et son calendrier propres.

Le modèle actuel est plat : une `property` est à la fois l'annonce et l'unité
louable. Les trois logements de Resi Adja ne peuvent donc exister que comme
trois biens sans lien entre eux — même adresse recopiée trois fois, aucun
regroupement dans les écrans, et aucune réponse à « combien m'a rapporté Resi
Adja ce mois-ci ? ».

## Vocabulaire

Deux mots distincts, tenus séparés dans tout ce document et dans le code :

- **Résidence** (`residences`) : le lieu. Porte l'adresse, les parties communes
  et les charges communes. **Ne se loue pas.**
- **Unité** (`properties`) : le logement loué. Porte le tarif, le calendrier et
  les réservations. C'est la maille de toute réservation.

Une résidence sans unité n'est pas louable ; une unité sans résidence reste un
bien autonome, comme aujourd'hui.

## Décision structurante

**La réservation se pose sur l'unité, jamais sur la résidence.**

C'est ce qui permet de louer le studio 1 et le studio 2 la même nuit : le
contrôle de chevauchement reste strictement par unité. Poser la réservation sur
la résidence rendrait les trois logements mutuellement exclusifs — le défaut
même que la suppression du statut `reserved` avait corrigé (voir
`availability.ts`).

Conséquence pratique : `bookings.property_id` garde exactement le sens qu'il a
aujourd'hui, et aucune réservation existante n'est à migrer.

## Décisions

| Sujet | Décision |
|---|---|
| Maille de la réservation | L'unité (`properties`), jamais la résidence |
| Adresse | Dupliquée sur chaque unité, la résidence restant la source |
| Choix du logement | Unités nommées — le client réserve « le studio 1 » |
| Rattachement au revenu | `residence_id` figé sur la réservation |
| Charges communes | Rattachées à la résidence, réparties sur aucune unité |
| Biens existants | `residence_id: null` — restent des biens autonomes |

### Pourquoi l'adresse est dupliquée

Firestore n'a pas de jointure. Une adresse portée seulement par la résidence
imposerait une lecture supplémentaire à chaque affichage d'annonce, côté client
comme dans les listes du propriétaire.

L'adresse est donc **copiée** sur l'unité au rattachement. C'est un instantané
figé, au même titre que `client_snapshot` et `daily_price` : corriger l'adresse
de la résidence ne réécrit pas les unités déjà créées. Le propriétaire qui veut
propager la correction la réapplique explicitement.

### Pourquoi `residence_id` est figé sur la réservation

Le rattachement est écrit **à la création** de la réservation, et jamais résolu
à la lecture depuis l'unité.

Sans cela, déplacer une unité d'une résidence à une autre réécrirait
rétroactivement le chiffre d'affaires des deux — un mois clos se mettrait à
bouger tout seul. Même raison que l'absence de `end_date` dans le patch de
clôture (voir `check_out_booking.use_case.ts`).

### Pourquoi les charges communes ne sont pas réparties

Une facture d'électricité commune ne se rattache à aucune unité. Trois options
étaient possibles : la répartir au prorata des jours loués, au prorata des
tarifs, ou pas du tout.

**Aucune répartition.** Au prorata des jours loués, un studio vide paierait zéro
électricité alors qu'il en consomme ; au prorata des tarifs, la clé est
arbitraire. Toute clé inventée produirait un « bénéfice par unité » faux avec
l'apparence de la précision.

Le bénéfice reste donc exact au niveau propriétaire — où il l'est déjà — et
devient disponible au niveau résidence. Il n'est simplement pas promis au niveau
unité.

## Modèle de données

### Collection `residences` (nouvelle)

```
residences/{id}
  owner_id       string    la résidence appartient au propriétaire
  name           string    « Resi Adja »
  description    string
  address        { street, city, country, postal_code, coordinates }
  media          { images[], videos[] }
  amenities      parties communes : piscine, gardien, wifi, parking…
  units_count    number    compteur dénormalisé, incrémenté atomiquement
  created_at     Date
  updated_at     Date
```

`units_count` est dénormalisé parce que Firestore ne sait pas compter les unités
d'une résidence sans une requête par résidence dans les listes. Incrémenté avec
`increment()`, comme `metadata.views_count`.

### Collection `properties` (modifiée)

```
+ residence_id   string | null    null = bien autonome
+ unit_label     string | null    « Studio 1 », « Chambre salon »
```

Les deux champs se lisent **optionnels avec repli** : les biens écrits avant ce
chantier n'en portent pas. `residence_id: null` signifie « bien autonome »,
c'est-à-dire le comportement actuel.

`unit_label` nomme l'unité dans sa résidence. Le `title` reste le titre de
l'annonce, que le client voit ; les écrans du propriétaire affichent
« Resi Adja › Studio 1 ».

### Collection `bookings` (modifiée)

```
+ residence_id   string | null    figé à la création, copié depuis l'unité
```

Écrit par les deux chemins de création — en ligne et comptoir. Jamais recalculé.

### Collection `expenses` (modifiée)

```
  property_id    string | null    devient optionnel
+ residence_id   string | null    charge commune
```

**Exactement l'un des deux** doit être renseigné : une dépense sans rattachement
ne serait imputable nulle part, et une dépense portant les deux serait comptée
deux fois. Règle levée en `DomainError`.

## Index Firestore

```
residences   owner_id ASC, created_at DESC
properties   owner_id ASC, residence_id ASC
bookings     residence_id ASC, start_date ASC
expenses     owner_id ASC, residence_id ASC
```

## Ce qui ne change pas

- **Le contrôle de chevauchement**, strictement par unité. Deux unités d'une
  même résidence se louent la même nuit.
- **Le taux d'occupation**, qui compte les unités exploitées. Resi Adja pèse
  trois unités au dénominateur, pas une.
- **Les biens sans résidence**, qui se comportent exactement comme avant.
- `bookings.property_id`, dont le sens est inchangé.

## Étapes

1. ✅ Collection `residences` : modèle, feature, contrôleur, routes.
2. ✅ Rattachement des unités : `residence_id` + `unit_label`, adresse copiée.
3. ✅ `residence_id` figé sur la réservation, sur les deux chemins de création.
4. ✅ Dépenses : `property_id` optionnel, `residence_id` ajouté, règle d'exclusivité.
5. ✅ Finance par résidence : `residence_id` dans `FinanceFilters`.
6. Mobile : modèles, cubits, écrans, cache SQLite.

L'API est complète. Il reste le mobile.

## Points de vigilance relevés à l'implémentation

**Le taux d'occupation change de dénominateur** quand le relevé est restreint à
une résidence : la capacité devient celle de ses unités. Garder le parc entier
écraserait le taux d'une résidence de trois studios chez un propriétaire qui en
compte trente.

**Les charges d'une résidence ne peuvent pas être lues par `Expense.summary`.**
Ses filtres sont des égalités, et un `where` sur `residence_id` exclurait les
charges d'unité. Elles passent donc par `findAllForOwner` puis
`sumResidenceExpenses`, seul endroit du code où les deux niveaux se rencontrent.

**Le relevé d'une résidence inconnue est un 404, pas un relevé à zéro** — sinon
il serait indistinguable d'une résidence sans activité. Le contrôle passe par
`findByIdAndOwner` : sans lui, un identifiant deviné livrerait le relevé d'un
autre compte.
