/* eslint-disable prettier/prettier */
/// <reference path="../manifest.d.ts" />

import type { ExtractBody, ExtractErrorResponse, ExtractQuery, ExtractQueryForGet, ExtractResponse } from '@tuyau/core/types'
import type { InferInput, SimpleError } from '@vinejs/vine/types'

export type ParamValue = string | number | bigint | boolean

export interface Registry {
  'auth.auth.register_init': {
    methods: ["POST"]
    pattern: '/api/v1/auth/register/init'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/auth/auth').registerInitValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/auth/auth').registerInitValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/auth/auth_controller').default['registerInit']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/auth/auth_controller').default['registerInit']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'auth.auth.register_verify': {
    methods: ["POST"]
    pattern: '/api/v1/auth/register/verify'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/auth/auth').registerVerifyValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/auth/auth').registerVerifyValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/auth/auth_controller').default['registerVerify']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/auth/auth_controller').default['registerVerify']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'auth.auth.login': {
    methods: ["POST"]
    pattern: '/api/v1/auth/login'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/auth/auth').loginValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/auth/auth').loginValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/auth/auth_controller').default['login']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/auth/auth_controller').default['login']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'auth.auth.google': {
    methods: ["POST"]
    pattern: '/api/v1/auth/google'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/auth/auth').googleLoginValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/auth/auth').googleLoginValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/auth/auth_controller').default['google']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/auth/auth_controller').default['google']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'auth.auth.refresh': {
    methods: ["POST"]
    pattern: '/api/v1/auth/refresh'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/auth/auth').refreshValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/auth/auth').refreshValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/auth/auth_controller').default['refresh']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/auth/auth_controller').default['refresh']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'auth.protected.auth.logout': {
    methods: ["POST"]
    pattern: '/api/v1/auth/logout'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/auth/auth').logoutValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/auth/auth').logoutValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/auth/auth_controller').default['logout']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/auth/auth_controller').default['logout']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'auth.protected.auth.me': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/auth/me'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/auth/auth_controller').default['me']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/auth/auth_controller').default['me']>>>
    }
  }
  'admin.plans.admin_plans.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/plans'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/subscription/plan').listPlansValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/plans_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/plans_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.plans.admin_plans.store': {
    methods: ["POST"]
    pattern: '/api/v1/admin/plans'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/subscription/plan').createPlanValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/subscription/plan').createPlanValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/plans_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/plans_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.plans.admin_plans.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/plans/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/plans_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/plans_controller').default['show']>>>
    }
  }
  'admin.plans.admin_plans.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/admin/plans/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/subscription/plan').updatePlanValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/subscription/plan').updatePlanValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/plans_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/plans_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.plans.admin_plans.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/admin/plans/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/plans_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/plans_controller').default['destroy']>>>
    }
  }
  'proprio.properties.proprio_property.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/proprio/properties'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/property/property').listOwnerPropertiesValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/property_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/property_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'proprio.properties.proprio_property.stats': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/proprio/properties/stats'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/property_controller').default['stats']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/property_controller').default['stats']>>>
    }
  }
  'proprio.properties.proprio_property.store': {
    methods: ["POST"]
    pattern: '/api/v1/proprio/properties'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/property/property').createPropertyValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/property/property').createPropertyValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/property_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/property_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'proprio.properties.proprio_property.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/proprio/properties/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/property_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/property_controller').default['show']>>>
    }
  }
  'proprio.properties.proprio_property.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/proprio/properties/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/property/property').updatePropertyValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/property/property').updatePropertyValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/property_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/property_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'proprio.properties.proprio_property.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/proprio/properties/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/property_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/property_controller').default['destroy']>>>
    }
  }
  'proprio.properties.proprio_property.publish': {
    methods: ["PATCH"]
    pattern: '/api/v1/proprio/properties/:id/publish'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/property_controller').default['publish']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/property_controller').default['publish']>>>
    }
  }
  'proprio.properties.proprio_property.unpublish': {
    methods: ["PATCH"]
    pattern: '/api/v1/proprio/properties/:id/unpublish'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/property_controller').default['unpublish']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/property_controller').default['unpublish']>>>
    }
  }
  'proprio.subscription': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/proprio/subscription'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/subscription_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/subscription_controller').default['show']>>>
    }
  }
  'client.properties.client_property.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/client/properties'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/property/property').listPublicPropertiesValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/client/property_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/client/property_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'client.properties.client_property.search': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/client/properties/search'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/client/property_controller').default['search']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/client/property_controller').default['search']>>>
    }
  }
  'client.properties.client_property.featured': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/client/properties/featured'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/property/property').listPublicPropertiesValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/client/property_controller').default['featured']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/client/property_controller').default['featured']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'client.properties.client_booking.store': {
    methods: ["POST"]
    pattern: '/api/v1/client/properties/:property_id/bookings'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/booking/booking').createBookingValidator)>>
      paramsTuple: [ParamValue]
      params: { property_id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/booking/booking').createBookingValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/client/booking_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/client/booking_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'client.properties.client_property.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/client/properties/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/client/property_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/client/property_controller').default['show']>>>
    }
  }
  'client.bookings.client_booking.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/client/bookings'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/booking/booking').listBookingsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/client/booking_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/client/booking_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'client.bookings.client_booking.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/client/bookings/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/booking/booking').updateBookingValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/booking/booking').updateBookingValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/client/booking_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/client/booking_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'client.bookings.client_booking.cancel': {
    methods: ["PATCH"]
    pattern: '/api/v1/client/bookings/:id/cancel'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/booking/booking').cancelBookingValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/booking/booking').cancelBookingValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/client/booking_controller').default['cancel']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/client/booking_controller').default['cancel']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'client.bookings.client_booking_payment.initialize_wave': {
    methods: ["POST"]
    pattern: '/api/v1/client/bookings/:id/payments/wave/init'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/client/booking_payment_controller').default['initializeWave']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/client/booking_payment_controller').default['initializeWave']>>>
    }
  }
  'client_booking_payment.wave_webhook': {
    methods: ["POST"]
    pattern: '/api/v1/payments/wave/webhook'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/client/booking_payment_controller').default['waveWebhook']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/client/booking_payment_controller').default['waveWebhook']>>>
    }
  }
  'cron.cron.expire_trials': {
    methods: ["GET","POST"]
    pattern: '/api/v1/cron/expire-trials'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/cron_controller').default['expireTrials']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/cron_controller').default['expireTrials']>>>
    }
  }
  'cron.cron.health': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/cron/health'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/cron_controller').default['health']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/cron_controller').default['health']>>>
    }
  }
}
