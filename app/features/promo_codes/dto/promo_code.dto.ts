export type PromoCodeType = 'percentage' | 'fixed'

export interface PromoCodeDto {
  id: string
  code: string
  type: PromoCodeType
  value: number
  min_amount: number | null
  max_uses: number | null
  uses_count: number
  max_uses_per_user: number
  starts_at: Date | null
  expires_at: Date | null
  is_active: boolean
  created_at: Date
  updated_at: Date
}

export interface CreatePromoCodeInput {
  code: string
  type: PromoCodeType
  value: number
  min_amount?: number | null
  max_uses?: number | null
  max_uses_per_user?: number
  starts_at?: Date | null
  expires_at?: Date | null
  is_active?: boolean
}

export interface UpdatePromoCodeInput {
  code?: string
  type?: PromoCodeType
  value?: number
  min_amount?: number | null
  max_uses?: number | null
  max_uses_per_user?: number
  starts_at?: Date | null
  expires_at?: Date | null
  is_active?: boolean
}
