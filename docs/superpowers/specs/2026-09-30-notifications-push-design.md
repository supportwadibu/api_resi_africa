# Notifications push

FCM, par le compte de service Firebase déjà utilisé pour Firestore : aucun
secret de plus.

## Appareils

`device_tokens/{sha256(jeton)}` : `user_id`, `role`, `token`, `platform`.
L'identifiant porte l'unicité : un téléphone qui change de compte réécrit le
même document. Le rôle est recopié pour que l'envoi groupé se lise en une
requête.

- `POST /auth/device-tokens` `{ token, platform }` — à chaque connexion et à
  chaque renouvellement du jeton (tous rôles).
- `DELETE /auth/device-tokens` `{ token }` — à la déconnexion, jetons de
  session encore valides.

Un jeton refusé définitivement par FCM (`registration-token-not-registered`,
`invalid-registration-token`) est supprimé au premier envoi qui échoue.

## Relances d'échéance

`GET|POST /cron/subscription-reminders`, gardée par `CRON_SECRET`
(`X-Cron-Secret` ou `?secret=`). À appeler chaque matin depuis cron-job.org.

- Étapes en jours calendaires d'Abidjan : J-7 (4 à 7 jours), J-3 (1 à 3),
  J (le jour même). Un passage manqué est rattrapé par l'étape en cours.
- Idempotente : chaque étape est réservée dans
  `notification_dispatches/{abonnement}:j{étape}:{échéance}` par `create()`
  **avant** l'envoi. Rappeler la route ne renvoie rien ; un abonnement
  prolongé repart pour un cycle neuf.
- Au toucher, l'application ouvre les forfaits.

## Envois du back-office

`POST /admin/notifications` `{ title, body, audience, owner_ids? }` —
`all_owners` (groupée) ou `selected_owners` (ciblée). Les appareils sont
filtrés sur le rôle `proprio` : un compte client glissé dans une sélection ne
reçoit rien. Chaque envoi est tracé dans `notification_campaigns`, même à 0
appareil. `GET /admin/notifications` en rend l'historique.

## Limites

- iOS : `GoogleService-Info.plist` absent et clé APNs à déposer dans la
  console Firebase — seules les notifications Android partent en l'état.
- Au premier plan, Android n'affiche pas la notification : l'application la
  montre en toast.
