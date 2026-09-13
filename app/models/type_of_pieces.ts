import { COLLECTIONS, collection, toDoc, toDocs, toPayload, type WithId } from '#firebase/firestore'

export interface TypeOfPieceDocument {
  name: string
  description: string | null
  code: string | null
  created_at: Date
  updated_at: Date
}

export type TypeOfPieceRecord = WithId<TypeOfPieceDocument>

function typesOfPieces() {
  return collection<TypeOfPieceDocument>(COLLECTIONS.typeOfPieces)
}

/** Référentiel des types de pièces d'un bien. */
const TypeOfPiece = {
  async findById(id: string): Promise<TypeOfPieceRecord | null> {
    if (!id) return null
    return toDoc<TypeOfPieceDocument>(await typesOfPieces().doc(id).get())
  },

  async findAll(): Promise<TypeOfPieceRecord[]> {
    const snapshot = await typesOfPieces().orderBy('name').get()
    return toDocs<TypeOfPieceDocument>(snapshot.docs)
  },

  async create(input: {
    name: string
    description?: string | null
    code?: string | null
  }): Promise<TypeOfPieceRecord> {
    const now = new Date()
    const payload: TypeOfPieceDocument = {
      name: input.name,
      description: input.description ?? null,
      code: input.code ?? null,
      created_at: now,
      updated_at: now,
    }

    const docRef = await typesOfPieces().add(toPayload(payload) as unknown as TypeOfPieceDocument)
    return { ...payload, _id: docRef.id }
  },

  async update(
    id: string,
    patch: Partial<Omit<TypeOfPieceDocument, 'created_at'>>
  ): Promise<TypeOfPieceRecord | null> {
    await typesOfPieces()
      .doc(id)
      .update(toPayload({ ...patch, updated_at: new Date() }))
    return TypeOfPiece.findById(id)
  },

  async delete(id: string): Promise<void> {
    await typesOfPieces().doc(id).delete()
  },
}

export default TypeOfPiece
