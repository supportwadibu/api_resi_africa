import PromoCode, { normalizeCode, type PromoCodeRecord } from '#models/promo_code'

import type {
  CreatePromoCodeInput,
  PromoCodeDto,
  UpdatePromoCodeInput,
} from '../dto/promo_code.dto.ts'

export class PromoCodeAdminRepository {
  static toDto(doc: PromoCodeRecord): PromoCodeDto {
    return {
      id: doc._id,
      code: doc.code,
      type: doc.type,
      value: doc.value,
      min_amount: doc.min_amount ?? null,
      max_uses: doc.max_uses ?? null,
      uses_count: doc.uses_count ?? 0,
      max_uses_per_user: doc.max_uses_per_user ?? 1,
      starts_at: doc.starts_at ?? null,
      expires_at: doc.expires_at ?? null,
      is_active: doc.is_active ?? true,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    }
  }

  async findById(id: string): Promise<PromoCodeDto | null> {
    const doc = await PromoCode.findById(id)
    return doc ? PromoCodeAdminRepository.toDto(doc) : null
  }

  async delete(id: string): Promise<boolean> {
    return PromoCode.deleteOne(id)
  }

  async create(input: CreatePromoCodeInput): Promise<PromoCodeDto> {
    const doc = await PromoCode.create(input)
    return PromoCodeAdminRepository.toDto(doc)
  }

  /**
   * Met à jour un code promo.
   *
   * Le code lui-même n'est pas modifiable : il sert d'identifiant de document,
   * et le renommer reviendrait à créer une seconde entrée en laissant l'ancienne
   * derrière — avec les utilisations déjà comptabilisées. Un changement de code
   * passe par une désactivation puis une création.
   */
  async update(id: string, input: UpdatePromoCodeInput): Promise<PromoCodeDto | null> {
    const { code, ...patch } = input as UpdatePromoCodeInput & { code?: string }

    if (code && normalizeCode(code) !== id) {
      throw new Error('promo_code_immutable')
    }

    const doc = await PromoCode.findByIdAndUpdate(id, patch)
    return doc ? PromoCodeAdminRepository.toDto(doc) : null
  }

  async list(): Promise<PromoCodeDto[]> {
    // Le back-office affiche l'intégralité des codes : leur nombre reste de
    // l'ordre de la dizaine, une pagination n'apporterait rien.
    const { data } = await PromoCode.paginate({ limit: 500, offset: 0 })
    return data.map((doc) => PromoCodeAdminRepository.toDto(doc))
  }
}

export default PromoCodeAdminRepository
