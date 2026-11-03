import app from '@adonisjs/core/services/app'
import { defineConfig } from '@adonisjs/cors'

import env from '#start/env'
import { parseCorsOrigins } from '#utils/cors_origins'

/**
 * CORS ne protège que des navigateurs : un appel natif ou serveur l'ignore,
 * et l'accès reste gardé par le jeton JWT. La règle se borne donc à n'ouvrir
 * l'API qu'aux pages web explicitement listées.
 *
 * https://docs.adonisjs.com/guides/security/cors
 */
const corsConfig = defineConfig({
  enabled: true,

  /**
   * En développement, toute origine : le front local change de port. Ailleurs,
   * la liste de `CORS_ALLOWED_ORIGINS`, vide par défaut — aucun client actuel
   * n'appelle l'API depuis un navigateur (voir `parseCorsOrigins`).
   */
  origin: app.inDev ? true : parseCorsOrigins(env.get('CORS_ALLOWED_ORIGINS')),

  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],

  /**
   * En-têtes reflétés : `Authorization` porte le jeton, et une liste figée
   * casserait le prochain en-tête ajouté par un client sans le dire.
   */
  headers: true,

  exposeHeaders: [],

  /**
   * Sans cookies : l'authentification passe par l'en-tête `Authorization`,
   * que le mode `credentials` ne concerne pas. L'activer laissait une origine
   * autorisée envoyer les cookies du domaine avec ses requêtes, sans aucun
   * usage côté API.
   */
  credentials: false,

  /** Préflight mis en cache une heure : la liste ne change qu'au déploiement. */
  maxAge: 3600,
})

export default corsConfig
