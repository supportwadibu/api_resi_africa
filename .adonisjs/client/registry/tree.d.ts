/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  health: typeof routes['health']
  apiHealth: typeof routes['api_health']
  auth: {
    auth: {
      registerInit: typeof routes['auth.auth.register_init']
      registerResend: typeof routes['auth.auth.register_resend']
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
      deviceToken: {
        store: typeof routes['auth.protected.device_token.store']
        destroy: typeof routes['auth.protected.device_token.destroy']
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
    auditLogs: {
      adminAuditLogs: {
        index: typeof routes['admin.audit_logs.admin_audit_logs.index']
        show: typeof routes['admin.audit_logs.admin_audit_logs.show']
      }
    }
    feedbacks: {
      adminFeedback: {
        index: typeof routes['admin.feedbacks.admin_feedback.index']
        show: typeof routes['admin.feedbacks.admin_feedback.show']
        updateStatus: typeof routes['admin.feedbacks.admin_feedback.update_status']
      }
    }
    withdrawals: {
      adminWithdrawals: {
        index: typeof routes['admin.withdrawals.admin_withdrawals.index']
        show: typeof routes['admin.withdrawals.admin_withdrawals.show']
        markPaid: typeof routes['admin.withdrawals.admin_withdrawals.mark_paid']
        reject: typeof routes['admin.withdrawals.admin_withdrawals.reject']
      }
    }
    withdrawalSettings: {
      adminWithdrawals: {
        settings: typeof routes['admin.withdrawal_settings.admin_withdrawals.settings']
        updateSettings: typeof routes['admin.withdrawal_settings.admin_withdrawals.update_settings']
      }
    }
    waveTest: {
      adminWaveTest: {
        config: typeof routes['admin.wave_test.admin_wave_test.config']
        checkout: typeof routes['admin.wave_test.admin_wave_test.checkout']
        show: typeof routes['admin.wave_test.admin_wave_test.show']
        refund: typeof routes['admin.wave_test.admin_wave_test.refund']
        expire: typeof routes['admin.wave_test.admin_wave_test.expire']
      }
    }
    notifications: {
      adminNotifications: {
        index: typeof routes['admin.notifications.admin_notifications.index']
        store: typeof routes['admin.notifications.admin_notifications.store']
      }
    }
    stats: {
      adminStats: {
        overview: typeof routes['admin.stats.admin_stats.overview']
        revenue: typeof routes['admin.stats.admin_stats.revenue']
        subscriptions: typeof routes['admin.stats.admin_stats.subscriptions']
      }
    }
    users: {
      adminUsers: {
        index: typeof routes['admin.users.admin_users.index']
        store: typeof routes['admin.users.admin_users.store']
        show: typeof routes['admin.users.admin_users.show']
        update: typeof routes['admin.users.admin_users.update']
        destroy: typeof routes['admin.users.admin_users.destroy']
        restore: typeof routes['admin.users.admin_users.restore']
        purgePreview: typeof routes['admin.users.admin_users.purge_preview']
        purge: typeof routes['admin.users.admin_users.purge']
      }
    }
    owners: {
      adminOwners: {
        index: typeof routes['admin.owners.admin_owners.index']
        pending: typeof routes['admin.owners.admin_owners.pending']
        show: typeof routes['admin.owners.admin_owners.show']
        profile: typeof routes['admin.owners.admin_owners.profile']
        portfolio: typeof routes['admin.owners.admin_owners.portfolio']
        validate: typeof routes['admin.owners.admin_owners.validate']
        reject: typeof routes['admin.owners.admin_owners.reject']
      }
      adminReports: {
        police: typeof routes['admin.owners.admin_reports.police']
      }
    }
    properties: {
      adminProperties: {
        index: typeof routes['admin.properties.admin_properties.index']
        show: typeof routes['admin.properties.admin_properties.show']
        clients: typeof routes['admin.properties.admin_properties.clients']
      }
    }
    residences: {
      adminResidences: {
        index: typeof routes['admin.residences.admin_residences.index']
        show: typeof routes['admin.residences.admin_residences.show']
      }
    }
    bookings: {
      adminBookings: {
        index: typeof routes['admin.bookings.admin_bookings.index']
        show: typeof routes['admin.bookings.admin_bookings.show']
      }
    }
    subscriptions: {
      adminSubscriptions: {
        index: typeof routes['admin.subscriptions.admin_subscriptions.index']
        cancel: typeof routes['admin.subscriptions.admin_subscriptions.cancel']
        extend: typeof routes['admin.subscriptions.admin_subscriptions.extend']
      }
    }
    promoCodes: {
      adminPromoCodes: {
        index: typeof routes['admin.promo_codes.admin_promo_codes.index']
        store: typeof routes['admin.promo_codes.admin_promo_codes.store']
        update: typeof routes['admin.promo_codes.admin_promo_codes.update']
        destroy: typeof routes['admin.promo_codes.admin_promo_codes.destroy']
      }
    }
    sponsorships: {
      adminSponsorships: {
        index: typeof routes['admin.sponsorships.admin_sponsorships.index']
        cancel: typeof routes['admin.sponsorships.admin_sponsorships.cancel']
      }
    }
    sponsorshipRedemptions: {
      adminSponsorships: {
        redemptions: typeof routes['admin.sponsorship_redemptions.admin_sponsorships.redemptions']
        markPaid: typeof routes['admin.sponsorship_redemptions.admin_sponsorships.mark_paid']
        reject: typeof routes['admin.sponsorship_redemptions.admin_sponsorships.reject']
      }
    }
    sponsorshipSettings: {
      adminSponsorships: {
        settings: typeof routes['admin.sponsorship_settings.admin_sponsorships.settings']
        updateSettings: typeof routes['admin.sponsorship_settings.admin_sponsorships.update_settings']
      }
    }
  }
  proprio: {
    subscription: typeof routes['proprio.subscription']
    subscriptionCheckout: typeof routes['proprio.subscription_checkout']
    subscriptionConfirm: typeof routes['proprio.subscription_confirm']
    subscriptionOptions: typeof routes['proprio.subscription_options']
    subscriptionCancel: typeof routes['proprio.subscription_cancel']
    plans: typeof routes['proprio.plans']
    profile: {
      proprioProfile: {
        show: typeof routes['proprio.profile.proprio_profile.show']
        store: typeof routes['proprio.profile.proprio_profile.store']
      }
    }
    feedbacks: {
      proprioFeedback: {
        index: typeof routes['proprio.feedbacks.proprio_feedback.index']
        store: typeof routes['proprio.feedbacks.proprio_feedback.store']
      }
    }
    dashboard: {
      proprioProperty: {
        stats: typeof routes['proprio.dashboard.proprio_property.stats']
      }
      proprioBooking: {
        stats: typeof routes['proprio.dashboard.proprio_booking.stats']
      }
      proprioFinance: {
        performance: typeof routes['proprio.dashboard.proprio_finance.performance']
      }
    }
    pro: {
      clientBook: {
        proprioClient: {
          index: typeof routes['proprio.pro.client_book.proprio_client.index']
          show: typeof routes['proprio.pro.client_book.proprio_client.show']
          bookings: typeof routes['proprio.pro.client_book.proprio_client.bookings']
          update: typeof routes['proprio.pro.client_book.proprio_client.update']
        }
      }
      expenses: {
        proprioExpense: {
          index: typeof routes['proprio.pro.expenses.proprio_expense.index']
          summary: typeof routes['proprio.pro.expenses.proprio_expense.summary']
          store: typeof routes['proprio.pro.expenses.proprio_expense.store']
          show: typeof routes['proprio.pro.expenses.proprio_expense.show']
          update: typeof routes['proprio.pro.expenses.proprio_expense.update']
          destroy: typeof routes['proprio.pro.expenses.proprio_expense.destroy']
        }
      }
      finance: {
        proprioFinance: {
          overview: typeof routes['proprio.pro.finance.proprio_finance.overview']
        }
      }
    }
    proPlus: {
      reports: {
        proprioReport: {
          store: typeof routes['proprio.pro_plus.reports.proprio_report.store']
        }
      }
      managers: {
        proprioManager: {
          index: typeof routes['proprio.pro_plus.managers.proprio_manager.index']
          store: typeof routes['proprio.pro_plus.managers.proprio_manager.store']
          show: typeof routes['proprio.pro_plus.managers.proprio_manager.show']
          update: typeof routes['proprio.pro_plus.managers.proprio_manager.update']
          replaceProperties: typeof routes['proprio.pro_plus.managers.proprio_manager.replace_properties']
          setStatus: typeof routes['proprio.pro_plus.managers.proprio_manager.set_status']
        }
      }
    }
    wallets: {
      proprioWallet: {
        index: typeof routes['proprio.wallets.proprio_wallet.index']
        transactions: typeof routes['proprio.wallets.proprio_wallet.transactions']
        requestWithdrawal: typeof routes['proprio.wallets.proprio_wallet.request_withdrawal']
      }
    }
    withdrawals: typeof routes['proprio.withdrawals']
    payoutSettings: typeof routes['proprio.payout_settings']
    payoutNumbers: typeof routes['proprio.payout_numbers']
    properties: {
      proprioProperty: {
        index: typeof routes['proprio.properties.proprio_property.index']
        availability: typeof routes['proprio.properties.proprio_property.availability']
        store: typeof routes['proprio.properties.proprio_property.store']
        show: typeof routes['proprio.properties.proprio_property.show']
        update: typeof routes['proprio.properties.proprio_property.update']
        destroy: typeof routes['proprio.properties.proprio_property.destroy']
        attachResidence: typeof routes['proprio.properties.proprio_property.attach_residence']
        publish: typeof routes['proprio.properties.proprio_property.publish']
        unpublish: typeof routes['proprio.properties.proprio_property.unpublish']
      }
      proprioPropertyImage: {
        store: typeof routes['proprio.properties.proprio_property_image.store']
      }
    }
    residences: {
      proprioResidence: {
        index: typeof routes['proprio.residences.proprio_residence.index']
        store: typeof routes['proprio.residences.proprio_residence.store']
        show: typeof routes['proprio.residences.proprio_residence.show']
        update: typeof routes['proprio.residences.proprio_residence.update']
        destroy: typeof routes['proprio.residences.proprio_residence.destroy']
      }
    }
    bookings: {
      proprioBooking: {
        index: typeof routes['proprio.bookings.proprio_booking.index']
        store: typeof routes['proprio.bookings.proprio_booking.store']
        cancel: typeof routes['proprio.bookings.proprio_booking.cancel']
        checkIn: typeof routes['proprio.bookings.proprio_booking.check_in']
        checkOutPreview: typeof routes['proprio.bookings.proprio_booking.check_out_preview']
        checkOut: typeof routes['proprio.bookings.proprio_booking.check_out']
        extend: typeof routes['proprio.bookings.proprio_booking.extend']
        update: typeof routes['proprio.bookings.proprio_booking.update']
      }
    }
    clients: {
      proprioClient: {
        lookup: typeof routes['proprio.clients.proprio_client.lookup']
        store: typeof routes['proprio.clients.proprio_client.store']
      }
    }
  }
  gerant: {
    properties: {
      gerantProperty: {
        index: typeof routes['gerant.properties.gerant_property.index']
        availability: typeof routes['gerant.properties.gerant_property.availability']
        show: typeof routes['gerant.properties.gerant_property.show']
        updateAvailability: typeof routes['gerant.properties.gerant_property.update_availability']
      }
    }
    residences: {
      gerantResidence: {
        index: typeof routes['gerant.residences.gerant_residence.index']
      }
    }
    bookings: {
      gerantBooking: {
        index: typeof routes['gerant.bookings.gerant_booking.index']
        stats: typeof routes['gerant.bookings.gerant_booking.stats']
        store: typeof routes['gerant.bookings.gerant_booking.store']
        show: typeof routes['gerant.bookings.gerant_booking.show']
        cancel: typeof routes['gerant.bookings.gerant_booking.cancel']
        checkIn: typeof routes['gerant.bookings.gerant_booking.check_in']
        checkOutPreview: typeof routes['gerant.bookings.gerant_booking.check_out_preview']
        checkOut: typeof routes['gerant.bookings.gerant_booking.check_out']
        recordPayment: typeof routes['gerant.bookings.gerant_booking.record_payment']
      }
      update: typeof routes['gerant.bookings.update']
      replace: typeof routes['gerant.bookings.replace']
      extend: typeof routes['gerant.bookings.extend']
    }
    clients: {
      gerantClient: {
        index: typeof routes['gerant.clients.gerant_client.index']
        lookup: typeof routes['gerant.clients.gerant_client.lookup']
        store: typeof routes['gerant.clients.gerant_client.store']
        show: typeof routes['gerant.clients.gerant_client.show']
        bookings: typeof routes['gerant.clients.gerant_client.bookings']
        update: typeof routes['gerant.clients.gerant_client.update']
      }
    }
    expenses: {
      gerantExpense: {
        index: typeof routes['gerant.expenses.gerant_expense.index']
        summary: typeof routes['gerant.expenses.gerant_expense.summary']
        store: typeof routes['gerant.expenses.gerant_expense.store']
        update: typeof routes['gerant.expenses.gerant_expense.update']
        destroy: typeof routes['gerant.expenses.gerant_expense.destroy']
      }
    }
    finance: {
      gerantFinance: {
        overview: typeof routes['gerant.finance.gerant_finance.overview']
      }
    }
    profile: {
      gerantProfile: {
        show: typeof routes['gerant.profile.gerant_profile.show']
        update: typeof routes['gerant.profile.gerant_profile.update']
      }
    }
  }
  client: {
    properties: {
      clientProperty: {
        index: typeof routes['client.properties.client_property.index']
        search: typeof routes['client.properties.client_property.search']
        featured: typeof routes['client.properties.client_property.featured']
        availability: typeof routes['client.properties.client_property.availability']
        show: typeof routes['client.properties.client_property.show']
      }
    }
    clientBooking: {
      store: typeof routes['client.client_booking.store']
    }
    clientNegotiation: {
      show: typeof routes['client.client_negotiation.show']
      next: typeof routes['client.client_negotiation.next']
    }
    bookings: {
      clientBooking: {
        index: typeof routes['client.bookings.client_booking.index']
        update: typeof routes['client.bookings.client_booking.update']
        cancel: typeof routes['client.bookings.client_booking.cancel']
        applySponsorshipCredit: typeof routes['client.bookings.client_booking.apply_sponsorship_credit']
      }
      clientBookingPayment: {
        initializeWave: typeof routes['client.bookings.client_booking_payment.initialize_wave']
        confirmWave: typeof routes['client.bookings.client_booking_payment.confirm_wave']
      }
    }
  }
  sponsorship: {
    sponsorship: {
      checkCode: typeof routes['sponsorship.sponsorship.check_code']
      show: typeof routes['sponsorship.sponsorship.show']
      apply: typeof routes['sponsorship.sponsorship.apply']
      sponsored: typeof routes['sponsorship.sponsorship.sponsored']
      transactions: typeof routes['sponsorship.sponsorship.transactions']
      redemptions: typeof routes['sponsorship.sponsorship.redemptions']
      requestRedemption: typeof routes['sponsorship.sponsorship.request_redemption']
    }
  }
  waveWebhook: typeof routes['wave_webhook']
  bookingWaveReturn: typeof routes['booking_wave_return']
  subscriptionWaveWebhook: typeof routes['subscription_wave_webhook']
  subscriptionWaveReturn: typeof routes['subscription_wave_return']
  waveTestReturn: typeof routes['wave_test_return']
  cron: {
    cron: {
      expireTrials: typeof routes['cron.cron.expire_trials']
      subscriptionReminders: typeof routes['cron.cron.subscription_reminders']
      stayStatuses: typeof routes['cron.cron.stay_statuses']
      sponsorshipRewards: typeof routes['cron.cron.sponsorship_rewards']
      purgeSessions: typeof routes['cron.cron.purge_sessions']
      purgeAuditLogs: typeof routes['cron.cron.purge_audit_logs']
      health: typeof routes['cron.cron.health']
    }
  }
}
