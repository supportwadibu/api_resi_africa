import { SCOPE_READ_LIMIT } from '#features/managers/scope'
import Residence, { type ResidenceRecord } from '#models/residence'

import type {
  CreateResidenceInput,
  ListResidencesInput,
  ResidenceDto,
  UpdateResidenceInput,
} from '../dto/residence.dto.ts'

export class ResidenceRepository {
  static toDto(doc: ResidenceRecord): ResidenceDto {
    return {
      id: doc._id,
      owner_id: doc.owner_id,
      name: doc.name,
      description: doc.description,
      address: doc.address,
      media: doc.media,
      amenities: doc.amenities,
      // Absent des résidences créées avant l'introduction du compteur : le
      // repli évite d'afficher « undefined unité ».
      units_count: doc.units_count ?? 0,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    }
  }

  async findById(id: string, owner_id: string): Promise<ResidenceDto | null> {
    const doc = await Residence.findByIdAndOwner(id, owner_id)
    return doc ? ResidenceRepository.toDto(doc) : null
  }

  async create(input: CreateResidenceInput): Promise<ResidenceDto> {
    const doc = await Residence.create({
      owner_id: input.owner_id,
      name: input.name,
      description: input.description,
      address: {
        street: input.address.street,
        city: input.address.city,
        country: input.address.country ?? 'CI',
        postal_code: input.address.postal_code ?? null,
        coordinates: {
          latitude: input.address.coordinates?.latitude ?? null,
          longitude: input.address.coordinates?.longitude ?? null,
        },
      },
      media: {
        images: input.media?.images ?? [],
        videos: input.media?.videos ?? [],
      },
      amenities: input.amenities,
    })

    return ResidenceRepository.toDto(doc)
  }

  async update(
    id: string,
    input: UpdateResidenceInput,
    owner_id: string
  ): Promise<ResidenceDto | null> {
    const doc = await Residence.findByIdAndUpdate(id, { ...input }, owner_id)
    return doc ? ResidenceRepository.toDto(doc) : null
  }

  async delete(id: string, owner_id: string): Promise<boolean> {
    return Residence.deleteOne(id, owner_id)
  }

  /**
   * Toutes les résidences du propriétaire, bornées.
   *
   * Sert le regroupement rendu à un gérant, qui se construit sur le périmètre
   * entier : une page partielle de résidences en masquerait certaines dont le
   * gérant sert pourtant des logements. Un propriétaire compte ses résidences
   * en dizaines.
   *
   * Distincte de `paginate` et non un cas particulier de celle-ci : `paginate`
   * sert une page à l'utilisateur et rabat donc `per_page` à 100, ce qui
   * tronquerait silencieusement un regroupement. Ici la borne est celle du
   * dépôt, `SCOPE_READ_LIMIT`, et elle n'est rabattue par personne.
   */
  async listAll(owner_id: string): Promise<ResidenceDto[]> {
    const { data } = await Residence.paginate({ owner_id }, { limit: SCOPE_READ_LIMIT, offset: 0 })
    return data.map((d) => ResidenceRepository.toDto(d))
  }

  async paginate(
    owner_id: string,
    input: ListResidencesInput
  ): Promise<{ data: ResidenceDto[]; total: number; page: number; perPage: number }> {
    const page = Math.max(1, input.page ?? 1)
    const perPage = Math.min(100, Math.max(1, input.per_page ?? 20))

    const { data, total } = await Residence.paginate(
      { owner_id },
      { limit: perPage, offset: (page - 1) * perPage }
    )

    return {
      data: data.map((d) => ResidenceRepository.toDto(d)),
      total,
      page,
      perPage,
    }
  }
}

export default ResidenceRepository
