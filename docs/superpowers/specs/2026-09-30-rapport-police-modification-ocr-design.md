# Rapport police, modification d'une réservation, lecture de la pièce

Quatre demandes livrées ensemble, parce qu'elles se tiennent : le rapport
police exige des données d'identité que la lecture de la pièce aide à saisir,
et la correction d'un montant faux passe par la modification d'une réservation.

## 1. Montant anormal sur une réservation comptoir (correctif)

### Constat

Fiche d'une réservation en cours : 11 jours, « Montant total 15 000 F »,
« Remise − 205 000 F ».

### Cause

Le calcul est fidèle aux données ; c'est la saisie qui est trompeuse. Le champ
du formulaire comptoir s'intitulait **« Montant reçu »**, mais il alimente
`received_amount`, qui porte le **prix convenu du séjour** (voir la note de
`2026-09-15-rapports-export-design.md`) :

```
total_amount    = received_amount                     15 000
discount_amount = expected_amount − received_amount  220 000 − 15 000 = 205 000
```

Le propriétaire a saisi ce qu'il avait encaissé ce jour-là, pas le prix du
séjour. L'argent réellement versé a pourtant son champ : l'acompte.

Écart annexe : le mobile applique les paliers de remise de durée au montant
attendu, le serveur ne le faisait pas pour le comptoir. Le propriétaire voyait
« Montant attendu 187 000 F », le serveur enregistrait 220 000 F attendus et
33 000 F de « remise » — une remise de durée affichée comme un rabais négocié.

### Correctif

- **Mobile, saisie** : « Prix convenu du séjour » (prérempli au tarif, à
  défaut), « Acompte versé ». Le récapitulatif montre la remise consentie, et
  un avertissement apparaît quand le prix convenu tombe sous la moitié du
  tarif — le cas exact de la capture.
- **Mobile, fiche** : « Tarif grille », « Remise consentie », « Montant du
  séjour », « Acompte versé », « Reste dû ». Les mots disent ce que les
  champs portent.
- **API** : `computeOwnerBookingAmounts` applique le palier de durée
  (`resolveDiscountPercent`) au séjour complet et le fige dans
  `duration_discount_percent`. Le montant attendu du serveur rejoint celui que
  l'écran annonce.
- **Données existantes** : la réservation fautive se corrige par la
  modification (§ 3). Aucune réécriture automatique : le serveur ne peut pas
  deviner si 15 000 F était un prix ou un versement.

## 2. Rapport police

Registre des personnes hébergées, au format de la Brigade mondaine de la
Préfecture de police d'Abidjan.

### Données

Le carnet ne portait que nom, téléphone et pièce (nature, numéro). La fiche
client gagne cinq champs, tous optionnels et `null` sur l'historique :

| Champ | Colonne du registre |
|---|---|
| `birth_date` | Date de naissance |
| `birth_place` | Lieu de naissance |
| `nationality` | Nationalité (texte libre, « Ivoirienne ») |
| `address` | Domicile habituel |
| `id_document_issued_at` | Date de délivrance de la pièce |

Ce sont des données de la personne, pas du séjour : elles vivent sur la fiche
et **ne sont pas figées** sur la réservation. Nom et téléphone restent lus sur
`client_snapshot`. Le document le signale en pied de page.

Une réservation en ligne n'a pas de fiche au carnet : ses colonnes d'identité
sortent vides (« — »), nom et contact lus sur le compte du client.

### Document

- Paysage A4, en-tête à deux colonnes : ministère à gauche, République à
  droite, `N° ______ /MIS/DGPN/PPA/BM` laissé à remplir à la main.
- **HÔTEL** : nom de la résidence choisie, à défaut le nom du propriétaire.
  **COMMUNE** : ville de la résidence, à défaut ligne vide à remplir.
- Période : `DU … AU …`, bornes de la période demandée.
- Lignes : séjours non annulés **chevauchant** la période, triés par entrée —
  un client arrivé avant la période et encore présent doit y figurer.
- Entrée et départ : `14/06/26` puis `14h00` en dessous, heure d'Abidjan.
  Départ : sortie réelle si le séjour est clos (`actual_check_out_at`), sinon
  sortie prévue.
- Colonne pièce : « CNI n° C0012345 du 12/03/2021 », parties absentes omises.

### Où

- **API** : type `police` ajouté à `POST /proprio/reports` (forfait 5 000 F,
  comme les autres rapports). Nouvelle route
  `POST /admin/owners/:id/reports/police` pour le back-office, même use case.
- **Mobile** : quatrième carte « Rapport police » dans l'écran Rapports.
- **Back-office** : bouton « Rapport police » sur la fiche d'un propriétaire,
  dialogue (résidence, du, au), téléchargement par un route handler — le
  navigateur ne parle jamais à l'API.

## 3. Modifier une réservation non terminée

`PUT /proprio/bookings/:id` et `PUT /gerant/bookings/:id` : le mobile envoie
la réservation complète — logement, type de séjour, entrée, sortie, prix
convenu, acompte, message.

- **Statuts** : `confirmed` et `in_progress`. Terminée ou annulée : 409.
- **Canal** : comptoir seulement. Une réservation en ligne a été payée à un
  prix calculé par la plateforme ; la réécrire au comptoir casserait ce
  contrat. 422 `booking_not_editable`.
- **Recalcul** : jours et montant attendu par `computeOwnerBookingAmounts` sur
  la grille **courante** du logement choisi — la réservation est ressaisie, pas
  prolongée. Prix convenu absent : le montant attendu. Remise, commission de
  l'apporteur recalculées.
- **Chevauchement** : contrôlé dans la transaction d'écriture, la réservation
  modifiée écartée par son identifiant.
- **Inchangés** : client et `client_snapshot`, source, `created_at`,
  apporteur. Changer de logement réécrit `residence_id` : c'est une
  correction de saisie, pas un déplacement d'unité.
- Pas de file hors ligne : comme la prolongation, la modification exige le
  réseau.

## 4. Lecture de la pièce d'identité (ML Kit)

`google_mlkit_text_recognition` **analyse** une image ; il ne pilote pas
l'appareil photo. La capture reste à `image_picker`, déjà présent. Deux
entrées, partout où une pièce se lit :

- **Scanner** : l'appareil photo s'ouvre, la lecture part seule au retour ;
- **Importer** : une photo de la galerie, lue de la même façon.

Deux lectures, combinées :

- **MRZ** (bande du verso, normalisée ICAO) : nom, prénoms, numéro, date de
  naissance, nationalité, vérifiés par chiffres de contrôle. Existait déjà.
- **Libellés du recto / verso** : « Lieu de naissance », « Date de
  délivrance », « Domicile ». Lecture au mieux, par libellé : la mise en page
  varie d'une pièce à l'autre, un champ non trouvé reste vide.

Chaque champ lu ne remplit qu'un champ vide ou prérempli par une lecture
précédente, et **tout reste modifiable** avant et après l'enregistrement.

- **Inscription propriétaire** : le numéro de pièce (et sa nature) se
  préremplit à la lecture du recto ou du verso.
- **Fiche client** : nom et prénoms, et les champs d'identité du § 2.

## 5. Prolongation au prix négocié

Une prolongation sans montant renégocié recalculait tout le séjour au tarif
de la grille : un client à 15 000 F/j négociés repassait à 20 000 F/j, et la
remise consentie sur les premiers jours disparaissait.

`extendedAgreedAmount` : si le prix a été négocié (`received_amount` ≠
`expected_amount`), le séjour prolongé vaut
`prix convenu ÷ jours vendus × nouveaux jours`, arrondi au franc. Sans
négociation, la grille s'applique au séjour entier, palier de durée compris.
Un montant renégocié explicitement (`received_amount` envoyé) prime toujours.

L'écran de prolongation annonce le même tarif (`extensionDailyRate`).
