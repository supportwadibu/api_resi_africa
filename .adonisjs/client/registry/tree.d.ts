/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  auth: {
    auth: {
      registerInit: typeof routes['auth.auth.register_init']
      registerVerify: typeof routes['auth.auth.register_verify']
      login: typeof routes['auth.auth.login']
      google: typeof routes['auth.auth.google']
      refresh: typeof routes['auth.auth.refresh']
    }
    protected: {
      auth: {
        logout: typeof routes['auth.protected.auth.logout']
        me: typeof routes['auth.protected.auth.me']
      }
    }
  }
  admin: {
    plans: {
      adminPlans: {
        index: typeof routes['admin.plans.admin_plans.index']
        store: typeof routes['admin.plans.admin_plans.store']
        show: typeof routes['admin.plans.admin_plans.show']
        update: typeof routes['admin.plans.admin_plans.update']
        destroy: typeof routes['admin.plans.admin_plans.destroy']
      }
    }
  }
  proprio: {
    properties: {
      proprioProperty: {
        index: typeof routes['proprio.properties.proprio_property.index']
        stats: typeof routes['proprio.properties.proprio_property.stats']
        store: typeof routes['proprio.properties.proprio_property.store']
        show: typeof routes['proprio.properties.proprio_property.show']
        update: typeof routes['proprio.properties.proprio_property.update']
        destroy: typeof routes['proprio.properties.proprio_property.destroy']
        publish: typeof routes['proprio.properties.proprio_property.publish']
        unpublish: typeof routes['proprio.properties.proprio_property.unpublish']
      }
    }
    subscription: typeof routes['proprio.subscription']
  }
  client: {
    properties: {
      clientProperty: {
        index: typeof routes['client.properties.client_property.index']
        search: typeof routes['client.properties.client_property.search']
        featured: typeof routes['client.properties.client_property.featured']
        show: typeof routes['client.properties.client_property.show']
      }
      clientBooking: {
        store: typeof routes['client.properties.client_booking.store']
      }
    }
    bookings: {
      clientBooking: {
        index: typeof routes['client.bookings.client_booking.index']
        update: typeof routes['client.bookings.client_booking.update']
        cancel: typeof routes['client.bookings.client_booking.cancel']
      }
      clientBookingPayment: {
        initializeWave: typeof routes['client.bookings.client_booking_payment.initialize_wave']
      }
    }
  }
  clientBookingPayment: {
    waveWebhook: typeof routes['client_booking_payment.wave_webhook']
  }
  cron: {
    cron: {
      expireTrials: typeof routes['cron.cron.expire_trials']
      health: typeof routes['cron.cron.health']
    }
  }
}
