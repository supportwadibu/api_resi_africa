# Mise en production de l'API

Hébergement : Render (Docker), région Frankfurt, domaine `api.resi.africa`.
Fichiers de référence : [`render.yaml`](../render.yaml) et
[`.env.production.example`](../.env.production.example).

Les étapes 1 à 3 se font une fois. L'étape 5 est à refaire après chaque
déploiement important.

## 1. Firebase (projet `resi-5c32a`)

1. **Index, règles Firestore et règles RTDB** — sans les index, les listes
   composites renvoient un 500 :
   ```bash
   firebase deploy --only firestore:indexes,firestore:rules,database --project resi-5c32a
   ```
   Attendre que tous les index soient « Activé » dans la console Firestore
   avant d'ouvrir le service.
2. **Activer l'API « Firebase Cloud Messaging API (v1) »** dans Google Cloud
   Console. Sans elle, aucune notification push ne part.
3. **Compte de service** : le convertir en une ligne pour
   `FIREBASE_SERVICE_ACCOUNT` :
   ```bash
   node -e "process.stdout.write(JSON.stringify(require('./service.json')))"
   ```

## 2. Render

### Si aucun service n'existe encore

Dashboard → **New → Blueprint** → dépôt `api`. Render lit `render.yaml`,
génère `APP_KEY`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` et `CRON_SECRET`,
puis demande les secrets marqués `sync: false` :

| Variable | Où la trouver |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT` | Étape 1.3 |
| `CLOUDINARY_CLOUD_NAME`, `_API_KEY`, `_API_SECRET` | Cloudinary → Settings → API Keys |
| `BOOTSTRAP_ADMINS` | `[{"full_name":"…","email":"…","password":"…"}]` — mot de passe fort, utilisé seulement à la création |
| `WAVE_API_KEY`, `WAVE_WEBHOOK_SECRET`, `WAVE_API_SIGNING_SECRET` | Wave Business → Développeurs (clés **production**) |
| `RESEND_API_KEY` | Resend → API Keys |
| `DUGU_API_KEY`, `DUGU_PROJECT_ID` | DUGU — clé `dsk_live_…` |
| `DUGU_WEBHOOK_SECRET` | DUGU → Applications → Webhook |

### Si un service tourne déjà sur `api.resi.africa`

Ne pas créer de blueprint : il ouvrirait un second service. Reporter les
valeurs de `.env.production.example` dans **Environment** du service
existant, en particulier `ENABLE_CRON_JOBS=true`, `TRUST_PROXY=1`,
`MAIL_PROVIDER=resend`, `WAVE_TEST_ENABLED=false`, et vérifier que l'offre
n'est pas gratuite (voir le commentaire de `plan` dans `render.yaml`).

Changer `JWT_*` sur un service existant déconnecte tous les utilisateurs ;
changer `APP_KEY` invalide les cookies chiffrés.

### Domaine

Settings → Custom Domains → `api.resi.africa`, puis l'enregistrement CNAME
indiqué chez le registraire. Le certificat TLS est émis par Render.

## 3. Services tiers

- **Wave** : déclarer le webhook
  `https://api.resi.africa/api/v1/payments/wave/webhook` et copier son secret
  dans `WAVE_WEBHOOK_SECRET`. Sans secret, tout webhook est refusé et aucun
  paiement n'aboutit.
- **DUGU Sender** : déclarer le webhook `https://api.resi.africa/webhooks/dugu`
  (Applications → Webhook) et copier son secret dans `DUGU_WEBHOOK_SECRET`.
  Sans secret, tout webhook est refusé — les OTP partent quand même, seul le
  suivi des échecs d'acheminement manque.
- **Resend** : domaine `resi.africa` vérifié (SPF, DKIM), templates
  `otp_email_verification` et `email_verified` publiés.
- **Tâches planifiées** : l'ordonnanceur interne les lance (six tâches, une
  seule instance). Aucun cron-job.org n'est nécessaire ; ne pas en ajouter un
  en plus, les relances partiraient en double.

## 4. Déploiement

`autoDeploy` est désactivé : **Manual Deploy → Deploy latest commit**. Le
mobile appelle des routes récentes : déployer l'API **avant** de publier une
version mobile qui en dépend.

## 5. Vérifications après déploiement

```bash
curl -s https://api.resi.africa/health
```

- [ ] Journaux Render : `Ordonnanceur node-cron initialisé et démarré`, aucune
      erreur de variable d'environnement.
- [ ] **IP réelle** : faire une requête depuis son téléphone, puis lire son IP
      dans le journal d'audit du back-office (`journal`). Elle doit être celle
      que donne https://ifconfig.me. Une IP Cloudflare (`104.x`,
      `172.64`–`172.71`) → `TRUST_PROXY=2`. Une IP privée (`10.x`) → la
      limite de débit est commune à tous les clients : à corriger avant
      l'ouverture.
- [ ] Inscription avec OTP WhatsApp et avec OTP e-mail.
- [ ] Connexion Google depuis l'APK signée par le Play Store (voir le guide
      mobile, empreintes SHA-1).
- [ ] Génération d'un rapport PDF : vérifie Chromium et la mémoire de
      l'instance.
- [ ] Paiement Wave réel d'un abonnement, puis réception du webhook.
- [ ] Notification push reçue sur un téléphone.
- [ ] Déclenchement manuel d'une tâche :
      `curl -H "X-Cron-Secret: <CRON_SECRET>" https://api.resi.africa/api/v1/cron/sponsorship-rewards`
