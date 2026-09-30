# Reste à faire — rapport police, réservations, lecture de pièce, notifications

**Date :** 2026-09-30
**Périmètre :** travaux du 30 septembre sur `api/`, `mobile/` et `backoffice/`.
Rien n'est commité.

Ce document liste ce qui manque, n'a pas été vérifié ou reste à décider. Les
points sont classés par urgence. Le fonctionnement livré est décrit dans :

- `docs/superpowers/specs/2026-09-30-rapport-police-modification-ocr-design.md`
- `docs/superpowers/specs/2026-09-30-notifications-push-design.md`

---

## 1. Bloquant avant mise en production

### Déploiement et configuration

- [ ] **Déployer les trois projets ensemble.** Le mobile appelle des routes
      nouvelles (`PUT /bookings/:id`, `/auth/device-tokens`, rapport `police`)
      qu'une API plus ancienne rejetterait.
- [ ] **Activer l'API « Firebase Cloud Messaging (v1) »** dans le projet Google
      Cloud et vérifier que le compte de service de l'API a le droit d'envoyer.
      Sans cela, aucune notification ne part (erreur au premier envoi).
- [ ] **Programmer la tâche sur cron-job.org** — un appel par jour, le matin :
      `GET https://<api>/api/v1/cron/subscription-reminders?secret=<CRON_SECRET>`.
- [ ] **Vérifier l'index Firestore `subscriptions : status + end_date`** en
      production (déclaré dans `firestore.indexes.json`, utilisé par les
      relances).
- [ ] **Chromium en production** : le rapport police est le premier PDF en
      paysage. Générer un rapport réel sur l'hébergeur pour vérifier le rendu.
- [ ] **`.env.example` est absent du dépôt `api/`**, alors que `CLAUDE.md` le
      donne pour référence. Aucune variable nouvelle n'a été ajoutée, mais le
      fichier devrait exister.

### iOS

- [ ] **Les notifications ne partent pas sur iPhone.** Il manque :
  - `ios/Runner/GoogleService-Info.plist` ;
  - la clé APNs, à déposer dans la console Firebase ;
  - les capacités Xcode « Push Notifications » et « Background Modes →
    Remote notifications ».

### Aucun essai sur appareil

Tout a été vérifié par tests automatiques, analyse et compilation, **jamais sur
un téléphone réel**. À dérouler au moins une fois :

- [ ] Lecture d'une vraie CNI ivoirienne (recto et verso), d'un passeport,
      d'une ancienne CNI sans bande MRZ.
- [ ] Réservation comptoir avec identité, **hors réseau**, puis
      synchronisation : la fiche client doit arriver complète au carnet.
- [ ] Migration de la base locale (v3 → v4) sur un téléphone ayant des
      réservations en attente : elles doivent survivre.
- [ ] Modification d'une réservation à venir et d'une réservation en cours.
- [ ] Prolongation d'un séjour au prix négocié.
- [ ] Génération du rapport police (mobile) et téléchargement (back-office).
- [ ] Notification : réception appareil fermé, ouvert et en arrière-plan ;
      toucher d'un rappel → écran des forfaits ; déconnexion → plus rien reçu.

---

## 2. Manques fonctionnels importants

### Rapport police

- [ ] **Les accompagnants ne sont pas enregistrés.** Une réservation porte un
      seul client. Le registre de police doit lister **chaque personne
      hébergée** : conjoint, enfants, amis. Il faut une liste d'occupants par
      séjour, avec leur identité.
- [ ] **Pas d'étape « client arrivé ».** Une réservation future reste
      « confirmée » jusqu'à la clôture. Le registre retient donc toute
      réservation dont l'heure d'entrée est passée, y compris un client qui ne
      s'est jamais présenté. Il faudrait une action « Check-in » qui fasse
      passer la réservation « en cours ».
- [ ] **Réservations en ligne** : colonnes d'identité vides (naissance,
      nationalité, pièce, domicile). Le compte client ne porte pas ces champs.
- [ ] **Commune non enregistrée** : elle se retape à chaque génération. Ajouter
      un champ `commune` à la résidence (API, mobile, back-office).
- [ ] **Ordre du nom** : imprimé « Prénoms Nom » (ordre du carnet). Le registre
      attend plutôt « NOM Prénoms ». Pas de champs nom et prénoms séparés.
- [ ] **Accès réservé au forfait 5 000 F**, comme les autres rapports. C'est
      une obligation légale : décider s'il doit être ouvert au forfait
      3 000 F.
- [ ] **Le gérant ne peut pas l'éditer** (les rapports sont fermés au gérant).
- [ ] **Périodes** : pas de raccourci « aujourd'hui » ni « cette semaine » ;
      seule la période personnalisée permet un registre quotidien.
- [ ] **Back-office** : édition possible depuis la fiche propriétaire
      seulement (pas depuis la fiche résidence, pas de section « Rapports »).
- [ ] Le numéro `N° ____ /MIS/DGPN/PPA/BM` reste à remplir à la main.

### Montants et encaissements

- [ ] **Le « Relevé des réservations » ignore l'argent encaissé en espèces.**
      Sa colonne « Encaissé » ne lit que les paiements Wave. Depuis que les
      versements au comptoir vont dans l'acompte (`deposit_amount`), il faut
      additionner l'acompte, sinon tout séjour payé en espèces paraît impayé.
- [ ] **Réservations déjà faussées** : celle de la capture (15 000 F,
      remise 205 000 F) et toutes les autres saisies de la même façon doivent
      être corrigées à la main. Il n'existe ni script de détection (par exemple
      remise > 50 % du tarif) ni écran pour les retrouver.
- [ ] **Encaissements gérant passés** : avant le correctif, chaque versement
      gonflait le prix du séjour. Les réservations concernées n'ont pas été
      recherchées ni corrigées.
- [ ] **Acompte supérieur au prix** : refusé à l'encaissement gérant, mais
      accepté à la création et à la modification d'une réservation.
- [ ] Le champ `received_amount` garde son nom trompeur (il porte le prix
      négocié) dans l'API et en base. Un renommage demanderait une migration.
- [ ] Pas de vue trésorerie (ce qui a réellement été encaissé), prévue « hors
      périmètre » depuis la conception du mode hors ligne.

### Modification d'une réservation

- [ ] Impossible de **changer le client** ou l'**apporteur**.
- [ ] Les **réservations en ligne** ne sont pas modifiables.
- [ ] **Pas de modification hors réseau** : l'écran exige la connexion.
- [ ] **Aucun historique** : on ne sait pas qui a modifié quoi, ni l'ancienne
      valeur.
- [ ] Pas de modification depuis le back-office.

### Prolongation

- [ ] Au prix négocié, le palier de remise par durée n'est plus appliqué à la
      prolongation (le tarif convenu fait foi). À valider comme règle métier.
- [ ] Au tarif grille, l'estimation affichée sur l'écran utilise le palier
      actuel. Si la prolongation franchit un palier, le serveur facture un peu
      moins que l'estimation.

### Lecture de la pièce (OCR)

- [ ] **Libellés lus au jugé** : lieu de naissance, date de délivrance et
      domicile sont testés sur des textes imaginés, pas sur ce que ML Kit rend
      d'une vraie pièce. Des ajustements sont probables.
- [ ] **Anciennes CNI sans bande MRZ** : seule la lecture des libellés joue,
      moins fiable.
- [ ] **Pas de capture automatique** (détection de la carte dans le cadre,
      recadrage) : « Scanner » = photo prise par l'utilisateur, puis lecture.
- [ ] Nationalités traduites pour une trentaine de pays seulement ; les autres
      gardent le code à trois lettres (« GHA »).
- [ ] Inscription propriétaire : seuls le numéro et la nature de la pièce sont
      préremplis, pas le nom.
- [ ] Le formulaire de réservation comptoir s'est beaucoup allongé (sept
      champs d'identité). Envisager un bloc repliable.

### Notifications push

- [ ] **Pas de relai par SMS ou WhatsApp** : un propriétaire sans application
      installée ne reçoit aucun rappel. Les fournisseurs SMS et WhatsApp
      existent déjà dans l'API (`services/notifications/messaging`).
- [ ] **Un rappel manqué est perdu** : l'étape est réservée avant l'envoi.
      Si FCM échoue, ou si le propriétaire n'a pas encore d'appareil déclaré,
      ce rappel ne repart pas ; seule l'étape suivante le rattrape.
- [ ] **Pas de boîte de réception dans l'application** : une notification
      balayée est perdue, rien ne la réaffiche.
- [ ] **Seul le propriétaire est relancé** : ses gérants, qui perdent aussi
      l'accès à l'échéance, ne sont pas prévenus.
- [ ] **Premier plan** : un simple message à l'écran (pas de vraie
      notification système) ; pas de `flutter_local_notifications`.
- [ ] **Icône Android** : aucune icône monochrome dédiée ; Android peut
      afficher un carré blanc dans la barre d'état.
- [ ] **Demande d'autorisation** posée à la connexion, sans écran
      d'explication préalable.
- [ ] **Back-office**
  - pas de confirmation avant un envoi à tous ;
  - pas d'aperçu du nombre d'appareils joignables avant l'envoi ;
  - pas d'envoi programmé, ni de lien vers un écran précis ;
  - la liste de sélection charge 1 000 propriétaires au plus et ne filtre pas
    par statut (actifs, suspendus, rejetés).
- [ ] **Rôle figé sur l'appareil** : si le rôle d'un compte change, son
      appareil garde l'ancien rôle jusqu'à la prochaine connexion.
- [ ] **Pas de nettoyage** des traces `notification_dispatches` (une par
      rappel envoyé, accumulées sans fin).

---

## 3. Qualité et documentation

- [ ] **35 tests mobiles échouent**, antérieurs à ces travaux et liés à la
      refonte UI en cours : `home/profile_tab_role_test` (15),
      `home/profile_tab_test` (10), `property/edit_property_summary_test` (3),
      `property/property_publish_role_test` (2),
      `residence/residence_gestures_role_test` (2),
      `stats/dashboard_cubit_test` (2), `gerant/gerant_overview_test` (1).
- [ ] **Pas de tests widget** pour les nouveaux écrans (modification de
      réservation, champs d'identité, section Notifications du back-office).
- [ ] **`CLAUDE.md` n'est pas à jour** : la liste des features de l'API
      n'inclut ni `reports` ni `notifications`, et les nouvelles collections
      (`device_tokens`, `notification_campaigns`,
      `notification_dispatches`) n'y figurent pas.
- [ ] **Données personnelles** : le carnet porte désormais naissance,
      nationalité et domicile. Aucune règle de conservation ni d'effacement
      n'est définie.
- [ ] **Commits** : rien n'est commité. Trois dépôts à commiter séparément ;
      le dépôt `mobile/` contient aussi la refonte UI en cours, non liée à ces
      travaux.

---

## 4. Décisions à prendre

| Question | Options |
| --- | --- |
| Accès au rapport police | Forfait 5 000 F (actuel) ou ouvert au 3 000 F |
| Qui figure au registre | Heure d'entrée passée (actuel) ou check-in confirmé (étape à créer) |
| Prolongation négociée | Tarif convenu sans palier (actuel) ou tarif convenu remisé par palier |
| Rappels sans application | Push seul (actuel) ou relai SMS / WhatsApp |
| Rappels aux gérants | Propriétaire seul (actuel) ou propriétaire et gérants |
