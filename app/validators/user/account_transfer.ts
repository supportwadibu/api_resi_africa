import vine from '@vinejs/vine'

/**
 * GET /admin/users/:id/export?sections=catalog,bookings
 *
 * Liste séparée par des virgules ; une clé inconnue est écartée par le use
 * case. Sans `sections`, seul le compte part.
 */
export const exportAccountValidator = vine.compile(
  vine.object({
    sections: vine
      .string()
      .trim()
      .maxLength(500)
      .transform((value) =>
        value
          .split(',')
          .map((key) => key.trim())
          .filter(Boolean)
      )
      .optional(),
  })
)

/** POST /admin/users/import — le fichier produit par l'export. */
export const importAccountValidator = vine.compile(
  vine.object({
    file: vine.file({ size: '20mb', extnames: ['json'] }),
  })
)

/** Une barre oblique ferait d'un identifiant un chemin vers une sous-collection. */
const documentId = () =>
  vine
    .string()
    .trim()
    .minLength(1)
    .maxLength(1500)
    .regex(/^[^/]+$/)

/**
 * Contenu du fichier, une fois lu. Les champs des documents passent tels
 * quels — c'est le principe de la copie — mais chaque document est rattaché
 * à une étape connue du serveur, et son appartenance au compte contrôlée.
 */
export const accountExportContentValidator = vine.compile(
  vine.object({
    account: vine.object({
      id: documentId(),
      data: vine.object({}).allowUnknownProperties(),
    }),
    steps: vine.record(
      vine.array(
        vine.object({
          id: documentId(),
          data: vine.object({}).allowUnknownProperties(),
        })
      )
    ),
  })
)
