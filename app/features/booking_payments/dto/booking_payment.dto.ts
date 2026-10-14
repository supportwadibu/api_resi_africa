export type BookingPaymentStatus = 'pending' | 'success' | 'failed' | 'cancelled' | 'expired'
export type BookingPaymentProvider = 'wave'

export interface BookingPaymentDto {
  id: string
  booking_id: string
  client_id: string
  owner_id: string
  property_id: string
  amount: number
  currency: string
  provider: BookingPaymentProvider
  status: BookingPaymentStatus
  transaction_reference: string
  provider_checkout_id: string | null
  provider_transaction_id: string | null
  payment_url: string | null
  callback_event_id: string | null
  failure_reason: string | null
  paid_at: Date | null
  cancelled_at: Date | null
  expired_at: Date | null
  metadata: Record<string, unknown>
  provider_payload: Record<string, unknown>
  created_at: Date
  updated_at: Date
}

export interface InitializeBookingPaymentOutput {
  payment: BookingPaymentDto
  payment_url: string
}
