import { defineConfig } from '@adonisjs/core/bodyparser'

const bodyParserConfig = defineConfig({
  /**
   * Parse request bodies for these HTTP methods.
   * Keep this aligned with methods that receive payloads in your routes.
   */
  allowedMethods: ['POST', 'PUT', 'PATCH', 'DELETE'],

  /**
   * Config for the "application/x-www-form-urlencoded"
   * content-type parser.
   */
  form: {
    /**
     * Normalize empty string values to null.
     */
    convertEmptyStringsToNull: true,

    /**
     * Content types handled by the form parser.
     */
    types: ['application/x-www-form-urlencoded'],
  },

  /**
   * Config for the JSON parser.
   */
  json: {
    /**
     * Normalize empty string values to null.
     */
    convertEmptyStringsToNull: true,

    /**
     * Content types handled by the JSON parser.
     */
    types: [
      'application/json',
      'application/json-patch+json',
      'application/vnd.api+json',
      'application/csp-report',
    ],
  },

  /**
   * Config for the "multipart/form-data" content-type parser.
   * File uploads are handled by the multipart parser.
   */
  multipart: {
    /**
     * Routes dont les fichiers sont écrits dans le dossier temporaire.
     *
     * Liste fermée plutôt que `true` : le bodyparser tourne avant `auth()`,
     * si bien que n'importe qui pouvait pousser 20 Mo de fichiers sur
     * `/auth/login` et les voir écrits sur disque. Ailleurs, un corps
     * multipart n'est pas lu. Une route qui reçoit un fichier s'ajoute ici.
     */
    autoProcess: [
      '/api/v1/proprio/profile',
      '/api/v1/proprio/properties/images',
      '/api/v1/proprio/clients',
      '/api/v1/proprio/clients/:id',
      '/api/v1/gerant/clients',
      '/api/v1/gerant/clients/:id',
    ],

    /**
     * Normalize empty string values to null.
     */
    convertEmptyStringsToNull: true,

    /**
     * Routes where multipart processing is handled manually.
     */
    processManually: [],

    /**
     * Maximum accepted payload size for multipart requests.
     */
    limit: '20mb',

    /**
     * Content types handled by the multipart parser.
     */
    types: ['multipart/form-data'],
  },
})

export default bodyParserConfig
