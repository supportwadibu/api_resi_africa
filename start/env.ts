/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  // Node
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.string(),

  // App
  APP_KEY: Env.schema.secret(),
  APP_URL: Env.schema.string({ format: 'url', tld: false }),

  // Session
  SESSION_DRIVER: Env.schema.enum(['cookie'] as const),

  /**
   * Firebase — compte de service au format JSON intégral.
   * Optionnel : sans lui, le SDK utilise les Application Default Credentials
   * (`GOOGLE_APPLICATION_CREDENTIALS` en local).
   */
  FIREBASE_SERVICE_ACCOUNT: Env.schema.string.optional(),
  /**
   * URL de la Realtime Database — requise : les OTP et les tentatives
   * d'authentification y sont stockés, donc l'inscription et le rate-limit en
   * dépendent.
   */
  FIREBASE_DATABASE_URL: Env.schema.string(),
  /** Utile seulement en mode ADC, où le projet n'est pas déduit du compte. */
  FIREBASE_PROJECT_ID: Env.schema.string.optional(),

  /**
   * Cloudinary — hébergement des pièces d'identité déposées par les
   * propriétaires et des photos d'annonces.
   *
   * Optionnelles au démarrage : une instance qui ne traite pas de dépôt de
   * dossier (worker, cron d'expiration) n'a pas à les porter. Leur absence est
   * signalée au premier envoi, avec un message explicite.
   */
  CLOUDINARY_CLOUD_NAME: Env.schema.string.optional(),
  CLOUDINARY_API_KEY: Env.schema.string.optional(),
  CLOUDINARY_API_SECRET: Env.schema.string.optional(),
  /** Dossier racine des justificatifs. Par défaut `resi/owner-documents`. */
  CLOUDINARY_DOCUMENTS_FOLDER: Env.schema.string.optional(),
  /** Dossier racine des photos d'annonces. Par défaut `resi/properties`. */
  CLOUDINARY_PROPERTIES_FOLDER: Env.schema.string.optional(),

  /**
   * Chemin du binaire Chromium utilisé pour rendre les rapports PDF.
   *
   * Renseigné par l'image Docker, qui installe Chromium via apt. Absent en
   * développement : Puppeteer retombe alors sur le navigateur qu'il a
   * téléchargé dans le cache de l'utilisateur — lequel ne survit pas à un
   * hébergement qui reconstruit l'environnement d'exécution après le build.
   */
  PUPPETEER_EXECUTABLE_PATH: Env.schema.string.optional(),

  // JWT
  JWT_ACCESS_SECRET: Env.schema.string(),
  JWT_REFRESH_SECRET: Env.schema.string(),
  JWT_ACCESS_TTL: Env.schema.string.optional(), // ex: "15m"
  JWT_REFRESH_TTL: Env.schema.string.optional(), // ex: "30d"

  /**
   * Google Sign-In — liste des audiences acceptées pour l'ID token, séparées par
   * des virgules. Le client Android, iOS et web ont chacun leur client_id ; tous
   * doivent être listés ici sinon la vérification d'audience échoue.
   */
  GOOGLE_CLIENT_IDS: Env.schema.string.optional(),

  /**
   * Secret protégeant les routes de tâches planifiées (`/api/v1/cron/*`),
   * appelées par un ordonnanceur externe — cron-job.org, Cloud Scheduler.
   *
   * Sans lui, ces routes sont refusées : elles sont publiques par nature (aucun
   * JWT ne peut être présenté par un appelant automatisé), le secret partagé
   * est donc leur seule protection.
   */
  CRON_SECRET: Env.schema.string.optional(),

  // Wave payments
  WAVE_API_KEY: Env.schema.string.optional(),
  WAVE_BASE_URL: Env.schema.string.optional(),
  WAVE_WEBHOOK_SECRET: Env.schema.string.optional(),
  WAVE_CURRENCY: Env.schema.string.optional(),

  // OTP / Auth rate limiting
  OTP_RATE_LIMIT_WINDOW_MINUTES: Env.schema.number.optional(),
  OTP_RATE_LIMIT_MAX: Env.schema.number.optional(),

  // Notifications — métadonnées génériques
  APP_NAME: Env.schema.string.optional(),
  SMS_SENDER_ID: Env.schema.string.optional(),

  // Sélection du provider messaging (SMS / WhatsApp)
  MESSAGING_PROVIDER: Env.schema.enum.optional([
    'console',
    'africas_talking',
    'bottom_line',
    'infobip',
    'orange',
  ] as const),
  /** Canal préféré quand le user_channel est 'phone'. Défaut: sms. */
  MESSAGING_PREFERRED_CHANNEL: Env.schema.enum.optional(['sms', 'whatsapp'] as const),

  // Africa's Talking
  AT_API_KEY: Env.schema.string.optional(),
  AT_USERNAME: Env.schema.string.optional(),
  AT_SMS_FROM: Env.schema.string.optional(),
  AT_WHATSAPP_FROM: Env.schema.string.optional(),
  AT_BASE_URL: Env.schema.string.optional(),
  AT_WHATSAPP_BASE_URL: Env.schema.string.optional(),

  // Infobip
  INFOBIP_BASE_URL: Env.schema.string.optional(),
  INFOBIP_API_KEY: Env.schema.string.optional(),
  INFOBIP_SMS_FROM: Env.schema.string.optional(),
  INFOBIP_WHATSAPP_FROM: Env.schema.string.optional(),

  // Orange Developer
  ORANGE_CLIENT_ID: Env.schema.string.optional(),
  ORANGE_CLIENT_SECRET: Env.schema.string.optional(),
  ORANGE_SENDER_ADDRESS: Env.schema.string.optional(),
  ORANGE_SENDER_NAME: Env.schema.string.optional(),
  ORANGE_BASE_URL: Env.schema.string.optional(),

  // Bottom Line (WhatsApp BSP)
  BOTTOMLINE_BASE_URL: Env.schema.string.optional(),
  BOTTOMLINE_API_KEY: Env.schema.string.optional(),
  BOTTOMLINE_WHATSAPP_FROM: Env.schema.string.optional(),
})
