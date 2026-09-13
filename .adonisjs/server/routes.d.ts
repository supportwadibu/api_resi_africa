import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'auth.auth.register_init': { paramsTuple?: []; params?: {} }
    'auth.auth.register_verify': { paramsTuple?: []; params?: {} }
    'auth.auth.login': { paramsTuple?: []; params?: {} }
    'auth.auth.google': { paramsTuple?: []; params?: {} }
    'auth.auth.refresh': { paramsTuple?: []; params?: {} }
    'auth.protected.auth.logout': { paramsTuple?: []; params?: {} }
    'auth.protected.auth.me': { paramsTuple?: []; params?: {} }
    'admin.plans.admin_plans.index': { paramsTuple?: []; params?: {} }
    'admin.plans.admin_plans.store': { paramsTuple?: []; params?: {} }
    'admin.plans.admin_plans.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.plans.admin_plans.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.plans.admin_plans.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.properties.proprio_property.index': { paramsTuple?: []; params?: {} }
    'proprio.properties.proprio_property.stats': { paramsTuple?: []; params?: {} }
    'proprio.properties.proprio_property.store': { paramsTuple?: []; params?: {} }
    'proprio.properties.proprio_property.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.properties.proprio_property.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.properties.proprio_property.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.properties.proprio_property.publish': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.properties.proprio_property.unpublish': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.subscription': { paramsTuple?: []; params?: {} }
    'client.properties.client_property.index': { paramsTuple?: []; params?: {} }
    'client.properties.client_property.search': { paramsTuple?: []; params?: {} }
    'client.properties.client_property.featured': { paramsTuple?: []; params?: {} }
    'client.properties.client_booking.store': { paramsTuple: [ParamValue]; params: {'property_id': ParamValue} }
    'client.properties.client_property.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'client.bookings.client_booking.index': { paramsTuple?: []; params?: {} }
    'client.bookings.client_booking.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'client.bookings.client_booking.cancel': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'client.bookings.client_booking_payment.initialize_wave': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'client_booking_payment.wave_webhook': { paramsTuple?: []; params?: {} }
    'cron.cron.expire_trials': { paramsTuple?: []; params?: {} }
    'cron.cron.health': { paramsTuple?: []; params?: {} }
  }
  GET: {
    'auth.protected.auth.me': { paramsTuple?: []; params?: {} }
    'admin.plans.admin_plans.index': { paramsTuple?: []; params?: {} }
    'admin.plans.admin_plans.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.properties.proprio_property.index': { paramsTuple?: []; params?: {} }
    'proprio.properties.proprio_property.stats': { paramsTuple?: []; params?: {} }
    'proprio.properties.proprio_property.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.subscription': { paramsTuple?: []; params?: {} }
    'client.properties.client_property.index': { paramsTuple?: []; params?: {} }
    'client.properties.client_property.search': { paramsTuple?: []; params?: {} }
    'client.properties.client_property.featured': { paramsTuple?: []; params?: {} }
    'client.properties.client_property.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'client.bookings.client_booking.index': { paramsTuple?: []; params?: {} }
    'cron.cron.expire_trials': { paramsTuple?: []; params?: {} }
    'cron.cron.health': { paramsTuple?: []; params?: {} }
  }
  HEAD: {
    'auth.protected.auth.me': { paramsTuple?: []; params?: {} }
    'admin.plans.admin_plans.index': { paramsTuple?: []; params?: {} }
    'admin.plans.admin_plans.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.properties.proprio_property.index': { paramsTuple?: []; params?: {} }
    'proprio.properties.proprio_property.stats': { paramsTuple?: []; params?: {} }
    'proprio.properties.proprio_property.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.subscription': { paramsTuple?: []; params?: {} }
    'client.properties.client_property.index': { paramsTuple?: []; params?: {} }
    'client.properties.client_property.search': { paramsTuple?: []; params?: {} }
    'client.properties.client_property.featured': { paramsTuple?: []; params?: {} }
    'client.properties.client_property.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'client.bookings.client_booking.index': { paramsTuple?: []; params?: {} }
    'cron.cron.health': { paramsTuple?: []; params?: {} }
  }
  POST: {
    'auth.auth.register_init': { paramsTuple?: []; params?: {} }
    'auth.auth.register_verify': { paramsTuple?: []; params?: {} }
    'auth.auth.login': { paramsTuple?: []; params?: {} }
    'auth.auth.google': { paramsTuple?: []; params?: {} }
    'auth.auth.refresh': { paramsTuple?: []; params?: {} }
    'auth.protected.auth.logout': { paramsTuple?: []; params?: {} }
    'admin.plans.admin_plans.store': { paramsTuple?: []; params?: {} }
    'proprio.properties.proprio_property.store': { paramsTuple?: []; params?: {} }
    'client.properties.client_booking.store': { paramsTuple: [ParamValue]; params: {'property_id': ParamValue} }
    'client.bookings.client_booking_payment.initialize_wave': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'client_booking_payment.wave_webhook': { paramsTuple?: []; params?: {} }
    'cron.cron.expire_trials': { paramsTuple?: []; params?: {} }
  }
  PATCH: {
    'admin.plans.admin_plans.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.properties.proprio_property.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.properties.proprio_property.publish': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.properties.proprio_property.unpublish': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'client.bookings.client_booking.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'client.bookings.client_booking.cancel': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  DELETE: {
    'admin.plans.admin_plans.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.properties.proprio_property.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}