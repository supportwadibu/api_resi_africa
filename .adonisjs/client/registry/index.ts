/* eslint-disable prettier/prettier */
import type { AdonisEndpoint } from '@tuyau/core/types'
import type { Registry } from './schema.d.ts'
import type { ApiDefinition } from './tree.d.ts'

const placeholder: any = {}

const routes = {
  'auth.auth.register_init': {
    methods: ["POST"],
    pattern: '/api/v1/auth/register/init',
    tokens: [{"old":"/api/v1/auth/register/init","type":0,"val":"api","end":""},{"old":"/api/v1/auth/register/init","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/register/init","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/register/init","type":0,"val":"register","end":""},{"old":"/api/v1/auth/register/init","type":0,"val":"init","end":""}],
    types: placeholder as Registry['auth.auth.register_init']['types'],
  },
  'auth.auth.register_verify': {
    methods: ["POST"],
    pattern: '/api/v1/auth/register/verify',
    tokens: [{"old":"/api/v1/auth/register/verify","type":0,"val":"api","end":""},{"old":"/api/v1/auth/register/verify","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/register/verify","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/register/verify","type":0,"val":"register","end":""},{"old":"/api/v1/auth/register/verify","type":0,"val":"verify","end":""}],
    types: placeholder as Registry['auth.auth.register_verify']['types'],
  },
  'auth.auth.login': {
    methods: ["POST"],
    pattern: '/api/v1/auth/login',
    tokens: [{"old":"/api/v1/auth/login","type":0,"val":"api","end":""},{"old":"/api/v1/auth/login","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/login","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/login","type":0,"val":"login","end":""}],
    types: placeholder as Registry['auth.auth.login']['types'],
  },
  'auth.auth.google': {
    methods: ["POST"],
    pattern: '/api/v1/auth/google',
    tokens: [{"old":"/api/v1/auth/google","type":0,"val":"api","end":""},{"old":"/api/v1/auth/google","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/google","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/google","type":0,"val":"google","end":""}],
    types: placeholder as Registry['auth.auth.google']['types'],
  },
  'auth.auth.refresh': {
    methods: ["POST"],
    pattern: '/api/v1/auth/refresh',
    tokens: [{"old":"/api/v1/auth/refresh","type":0,"val":"api","end":""},{"old":"/api/v1/auth/refresh","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/refresh","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/refresh","type":0,"val":"refresh","end":""}],
    types: placeholder as Registry['auth.auth.refresh']['types'],
  },
  'auth.protected.auth.logout': {
    methods: ["POST"],
    pattern: '/api/v1/auth/logout',
    tokens: [{"old":"/api/v1/auth/logout","type":0,"val":"api","end":""},{"old":"/api/v1/auth/logout","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/logout","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/logout","type":0,"val":"logout","end":""}],
    types: placeholder as Registry['auth.protected.auth.logout']['types'],
  },
  'auth.protected.auth.me': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/auth/me',
    tokens: [{"old":"/api/v1/auth/me","type":0,"val":"api","end":""},{"old":"/api/v1/auth/me","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/me","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/me","type":0,"val":"me","end":""}],
    types: placeholder as Registry['auth.protected.auth.me']['types'],
  },
  'admin.plans.admin_plans.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/admin/plans',
    tokens: [{"old":"/api/v1/admin/plans","type":0,"val":"api","end":""},{"old":"/api/v1/admin/plans","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/plans","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/plans","type":0,"val":"plans","end":""}],
    types: placeholder as Registry['admin.plans.admin_plans.index']['types'],
  },
  'admin.plans.admin_plans.store': {
    methods: ["POST"],
    pattern: '/api/v1/admin/plans',
    tokens: [{"old":"/api/v1/admin/plans","type":0,"val":"api","end":""},{"old":"/api/v1/admin/plans","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/plans","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/plans","type":0,"val":"plans","end":""}],
    types: placeholder as Registry['admin.plans.admin_plans.store']['types'],
  },
  'admin.plans.admin_plans.show': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/admin/plans/:id',
    tokens: [{"old":"/api/v1/admin/plans/:id","type":0,"val":"api","end":""},{"old":"/api/v1/admin/plans/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/plans/:id","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/plans/:id","type":0,"val":"plans","end":""},{"old":"/api/v1/admin/plans/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['admin.plans.admin_plans.show']['types'],
  },
  'admin.plans.admin_plans.update': {
    methods: ["PATCH"],
    pattern: '/api/v1/admin/plans/:id',
    tokens: [{"old":"/api/v1/admin/plans/:id","type":0,"val":"api","end":""},{"old":"/api/v1/admin/plans/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/plans/:id","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/plans/:id","type":0,"val":"plans","end":""},{"old":"/api/v1/admin/plans/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['admin.plans.admin_plans.update']['types'],
  },
  'admin.plans.admin_plans.destroy': {
    methods: ["DELETE"],
    pattern: '/api/v1/admin/plans/:id',
    tokens: [{"old":"/api/v1/admin/plans/:id","type":0,"val":"api","end":""},{"old":"/api/v1/admin/plans/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/plans/:id","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/plans/:id","type":0,"val":"plans","end":""},{"old":"/api/v1/admin/plans/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['admin.plans.admin_plans.destroy']['types'],
  },
  'proprio.properties.proprio_property.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/proprio/properties',
    tokens: [{"old":"/api/v1/proprio/properties","type":0,"val":"api","end":""},{"old":"/api/v1/proprio/properties","type":0,"val":"v1","end":""},{"old":"/api/v1/proprio/properties","type":0,"val":"proprio","end":""},{"old":"/api/v1/proprio/properties","type":0,"val":"properties","end":""}],
    types: placeholder as Registry['proprio.properties.proprio_property.index']['types'],
  },
  'proprio.properties.proprio_property.stats': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/proprio/properties/stats',
    tokens: [{"old":"/api/v1/proprio/properties/stats","type":0,"val":"api","end":""},{"old":"/api/v1/proprio/properties/stats","type":0,"val":"v1","end":""},{"old":"/api/v1/proprio/properties/stats","type":0,"val":"proprio","end":""},{"old":"/api/v1/proprio/properties/stats","type":0,"val":"properties","end":""},{"old":"/api/v1/proprio/properties/stats","type":0,"val":"stats","end":""}],
    types: placeholder as Registry['proprio.properties.proprio_property.stats']['types'],
  },
  'proprio.properties.proprio_property.store': {
    methods: ["POST"],
    pattern: '/api/v1/proprio/properties',
    tokens: [{"old":"/api/v1/proprio/properties","type":0,"val":"api","end":""},{"old":"/api/v1/proprio/properties","type":0,"val":"v1","end":""},{"old":"/api/v1/proprio/properties","type":0,"val":"proprio","end":""},{"old":"/api/v1/proprio/properties","type":0,"val":"properties","end":""}],
    types: placeholder as Registry['proprio.properties.proprio_property.store']['types'],
  },
  'proprio.properties.proprio_property.show': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/proprio/properties/:id',
    tokens: [{"old":"/api/v1/proprio/properties/:id","type":0,"val":"api","end":""},{"old":"/api/v1/proprio/properties/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/proprio/properties/:id","type":0,"val":"proprio","end":""},{"old":"/api/v1/proprio/properties/:id","type":0,"val":"properties","end":""},{"old":"/api/v1/proprio/properties/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['proprio.properties.proprio_property.show']['types'],
  },
  'proprio.properties.proprio_property.update': {
    methods: ["PATCH"],
    pattern: '/api/v1/proprio/properties/:id',
    tokens: [{"old":"/api/v1/proprio/properties/:id","type":0,"val":"api","end":""},{"old":"/api/v1/proprio/properties/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/proprio/properties/:id","type":0,"val":"proprio","end":""},{"old":"/api/v1/proprio/properties/:id","type":0,"val":"properties","end":""},{"old":"/api/v1/proprio/properties/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['proprio.properties.proprio_property.update']['types'],
  },
  'proprio.properties.proprio_property.destroy': {
    methods: ["DELETE"],
    pattern: '/api/v1/proprio/properties/:id',
    tokens: [{"old":"/api/v1/proprio/properties/:id","type":0,"val":"api","end":""},{"old":"/api/v1/proprio/properties/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/proprio/properties/:id","type":0,"val":"proprio","end":""},{"old":"/api/v1/proprio/properties/:id","type":0,"val":"properties","end":""},{"old":"/api/v1/proprio/properties/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['proprio.properties.proprio_property.destroy']['types'],
  },
  'proprio.properties.proprio_property.publish': {
    methods: ["PATCH"],
    pattern: '/api/v1/proprio/properties/:id/publish',
    tokens: [{"old":"/api/v1/proprio/properties/:id/publish","type":0,"val":"api","end":""},{"old":"/api/v1/proprio/properties/:id/publish","type":0,"val":"v1","end":""},{"old":"/api/v1/proprio/properties/:id/publish","type":0,"val":"proprio","end":""},{"old":"/api/v1/proprio/properties/:id/publish","type":0,"val":"properties","end":""},{"old":"/api/v1/proprio/properties/:id/publish","type":1,"val":"id","end":""},{"old":"/api/v1/proprio/properties/:id/publish","type":0,"val":"publish","end":""}],
    types: placeholder as Registry['proprio.properties.proprio_property.publish']['types'],
  },
  'proprio.properties.proprio_property.unpublish': {
    methods: ["PATCH"],
    pattern: '/api/v1/proprio/properties/:id/unpublish',
    tokens: [{"old":"/api/v1/proprio/properties/:id/unpublish","type":0,"val":"api","end":""},{"old":"/api/v1/proprio/properties/:id/unpublish","type":0,"val":"v1","end":""},{"old":"/api/v1/proprio/properties/:id/unpublish","type":0,"val":"proprio","end":""},{"old":"/api/v1/proprio/properties/:id/unpublish","type":0,"val":"properties","end":""},{"old":"/api/v1/proprio/properties/:id/unpublish","type":1,"val":"id","end":""},{"old":"/api/v1/proprio/properties/:id/unpublish","type":0,"val":"unpublish","end":""}],
    types: placeholder as Registry['proprio.properties.proprio_property.unpublish']['types'],
  },
  'proprio.subscription': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/proprio/subscription',
    tokens: [{"old":"/api/v1/proprio/subscription","type":0,"val":"api","end":""},{"old":"/api/v1/proprio/subscription","type":0,"val":"v1","end":""},{"old":"/api/v1/proprio/subscription","type":0,"val":"proprio","end":""},{"old":"/api/v1/proprio/subscription","type":0,"val":"subscription","end":""}],
    types: placeholder as Registry['proprio.subscription']['types'],
  },
  'client.properties.client_property.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/client/properties',
    tokens: [{"old":"/api/v1/client/properties","type":0,"val":"api","end":""},{"old":"/api/v1/client/properties","type":0,"val":"v1","end":""},{"old":"/api/v1/client/properties","type":0,"val":"client","end":""},{"old":"/api/v1/client/properties","type":0,"val":"properties","end":""}],
    types: placeholder as Registry['client.properties.client_property.index']['types'],
  },
  'client.properties.client_property.search': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/client/properties/search',
    tokens: [{"old":"/api/v1/client/properties/search","type":0,"val":"api","end":""},{"old":"/api/v1/client/properties/search","type":0,"val":"v1","end":""},{"old":"/api/v1/client/properties/search","type":0,"val":"client","end":""},{"old":"/api/v1/client/properties/search","type":0,"val":"properties","end":""},{"old":"/api/v1/client/properties/search","type":0,"val":"search","end":""}],
    types: placeholder as Registry['client.properties.client_property.search']['types'],
  },
  'client.properties.client_property.featured': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/client/properties/featured',
    tokens: [{"old":"/api/v1/client/properties/featured","type":0,"val":"api","end":""},{"old":"/api/v1/client/properties/featured","type":0,"val":"v1","end":""},{"old":"/api/v1/client/properties/featured","type":0,"val":"client","end":""},{"old":"/api/v1/client/properties/featured","type":0,"val":"properties","end":""},{"old":"/api/v1/client/properties/featured","type":0,"val":"featured","end":""}],
    types: placeholder as Registry['client.properties.client_property.featured']['types'],
  },
  'client.properties.client_booking.store': {
    methods: ["POST"],
    pattern: '/api/v1/client/properties/:property_id/bookings',
    tokens: [{"old":"/api/v1/client/properties/:property_id/bookings","type":0,"val":"api","end":""},{"old":"/api/v1/client/properties/:property_id/bookings","type":0,"val":"v1","end":""},{"old":"/api/v1/client/properties/:property_id/bookings","type":0,"val":"client","end":""},{"old":"/api/v1/client/properties/:property_id/bookings","type":0,"val":"properties","end":""},{"old":"/api/v1/client/properties/:property_id/bookings","type":1,"val":"property_id","end":""},{"old":"/api/v1/client/properties/:property_id/bookings","type":0,"val":"bookings","end":""}],
    types: placeholder as Registry['client.properties.client_booking.store']['types'],
  },
  'client.properties.client_property.show': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/client/properties/:id',
    tokens: [{"old":"/api/v1/client/properties/:id","type":0,"val":"api","end":""},{"old":"/api/v1/client/properties/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/client/properties/:id","type":0,"val":"client","end":""},{"old":"/api/v1/client/properties/:id","type":0,"val":"properties","end":""},{"old":"/api/v1/client/properties/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['client.properties.client_property.show']['types'],
  },
  'client.bookings.client_booking.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/client/bookings',
    tokens: [{"old":"/api/v1/client/bookings","type":0,"val":"api","end":""},{"old":"/api/v1/client/bookings","type":0,"val":"v1","end":""},{"old":"/api/v1/client/bookings","type":0,"val":"client","end":""},{"old":"/api/v1/client/bookings","type":0,"val":"bookings","end":""}],
    types: placeholder as Registry['client.bookings.client_booking.index']['types'],
  },
  'client.bookings.client_booking.update': {
    methods: ["PATCH"],
    pattern: '/api/v1/client/bookings/:id',
    tokens: [{"old":"/api/v1/client/bookings/:id","type":0,"val":"api","end":""},{"old":"/api/v1/client/bookings/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/client/bookings/:id","type":0,"val":"client","end":""},{"old":"/api/v1/client/bookings/:id","type":0,"val":"bookings","end":""},{"old":"/api/v1/client/bookings/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['client.bookings.client_booking.update']['types'],
  },
  'client.bookings.client_booking.cancel': {
    methods: ["PATCH"],
    pattern: '/api/v1/client/bookings/:id/cancel',
    tokens: [{"old":"/api/v1/client/bookings/:id/cancel","type":0,"val":"api","end":""},{"old":"/api/v1/client/bookings/:id/cancel","type":0,"val":"v1","end":""},{"old":"/api/v1/client/bookings/:id/cancel","type":0,"val":"client","end":""},{"old":"/api/v1/client/bookings/:id/cancel","type":0,"val":"bookings","end":""},{"old":"/api/v1/client/bookings/:id/cancel","type":1,"val":"id","end":""},{"old":"/api/v1/client/bookings/:id/cancel","type":0,"val":"cancel","end":""}],
    types: placeholder as Registry['client.bookings.client_booking.cancel']['types'],
  },
  'client.bookings.client_booking_payment.initialize_wave': {
    methods: ["POST"],
    pattern: '/api/v1/client/bookings/:id/payments/wave/init',
    tokens: [{"old":"/api/v1/client/bookings/:id/payments/wave/init","type":0,"val":"api","end":""},{"old":"/api/v1/client/bookings/:id/payments/wave/init","type":0,"val":"v1","end":""},{"old":"/api/v1/client/bookings/:id/payments/wave/init","type":0,"val":"client","end":""},{"old":"/api/v1/client/bookings/:id/payments/wave/init","type":0,"val":"bookings","end":""},{"old":"/api/v1/client/bookings/:id/payments/wave/init","type":1,"val":"id","end":""},{"old":"/api/v1/client/bookings/:id/payments/wave/init","type":0,"val":"payments","end":""},{"old":"/api/v1/client/bookings/:id/payments/wave/init","type":0,"val":"wave","end":""},{"old":"/api/v1/client/bookings/:id/payments/wave/init","type":0,"val":"init","end":""}],
    types: placeholder as Registry['client.bookings.client_booking_payment.initialize_wave']['types'],
  },
  'client_booking_payment.wave_webhook': {
    methods: ["POST"],
    pattern: '/api/v1/payments/wave/webhook',
    tokens: [{"old":"/api/v1/payments/wave/webhook","type":0,"val":"api","end":""},{"old":"/api/v1/payments/wave/webhook","type":0,"val":"v1","end":""},{"old":"/api/v1/payments/wave/webhook","type":0,"val":"payments","end":""},{"old":"/api/v1/payments/wave/webhook","type":0,"val":"wave","end":""},{"old":"/api/v1/payments/wave/webhook","type":0,"val":"webhook","end":""}],
    types: placeholder as Registry['client_booking_payment.wave_webhook']['types'],
  },
  'cron.cron.expire_trials': {
    methods: ["GET","POST"],
    pattern: '/api/v1/cron/expire-trials',
    tokens: [{"old":"/api/v1/cron/expire-trials","type":0,"val":"api","end":""},{"old":"/api/v1/cron/expire-trials","type":0,"val":"v1","end":""},{"old":"/api/v1/cron/expire-trials","type":0,"val":"cron","end":""},{"old":"/api/v1/cron/expire-trials","type":0,"val":"expire-trials","end":""}],
    types: placeholder as Registry['cron.cron.expire_trials']['types'],
  },
  'cron.cron.health': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/cron/health',
    tokens: [{"old":"/api/v1/cron/health","type":0,"val":"api","end":""},{"old":"/api/v1/cron/health","type":0,"val":"v1","end":""},{"old":"/api/v1/cron/health","type":0,"val":"cron","end":""},{"old":"/api/v1/cron/health","type":0,"val":"health","end":""}],
    types: placeholder as Registry['cron.cron.health']['types'],
  },
} as const satisfies Record<string, AdonisEndpoint>

export { routes }

export const registry = {
  routes,
  $tree: {} as ApiDefinition,
}

declare module '@tuyau/core/types' {
  export interface UserRegistry {
    routes: typeof routes
    $tree: ApiDefinition
  }
}
