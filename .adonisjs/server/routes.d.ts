import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'health': { paramsTuple?: []; params?: {} }
    'api_health': { paramsTuple?: []; params?: {} }
    'auth.auth.register_init': { paramsTuple?: []; params?: {} }
    'auth.auth.register_resend': { paramsTuple?: []; params?: {} }
    'auth.auth.register_verify': { paramsTuple?: []; params?: {} }
    'auth.auth.login': { paramsTuple?: []; params?: {} }
    'auth.auth.google': { paramsTuple?: []; params?: {} }
    'auth.auth.refresh': { paramsTuple?: []; params?: {} }
    'auth.protected.auth.logout': { paramsTuple?: []; params?: {} }
    'auth.protected.auth.me': { paramsTuple?: []; params?: {} }
    'auth.protected.device_token.store': { paramsTuple?: []; params?: {} }
    'auth.protected.device_token.destroy': { paramsTuple?: []; params?: {} }
    'admin.plans.admin_plans.index': { paramsTuple?: []; params?: {} }
    'admin.plans.admin_plans.store': { paramsTuple?: []; params?: {} }
    'admin.plans.admin_plans.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.plans.admin_plans.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.plans.admin_plans.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.audit_logs.admin_audit_logs.index': { paramsTuple?: []; params?: {} }
    'admin.audit_logs.admin_audit_logs.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.feedbacks.admin_feedback.index': { paramsTuple?: []; params?: {} }
    'admin.feedbacks.admin_feedback.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.feedbacks.admin_feedback.update_status': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.withdrawals.admin_withdrawals.index': { paramsTuple?: []; params?: {} }
    'admin.withdrawals.admin_withdrawals.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.withdrawals.admin_withdrawals.mark_paid': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.withdrawals.admin_withdrawals.reject': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.withdrawal_settings.admin_withdrawals.settings': { paramsTuple?: []; params?: {} }
    'admin.withdrawal_settings.admin_withdrawals.update_settings': { paramsTuple?: []; params?: {} }
    'admin.wave_test.admin_wave_test.config': { paramsTuple?: []; params?: {} }
    'admin.wave_test.admin_wave_test.checkout': { paramsTuple?: []; params?: {} }
    'admin.wave_test.admin_wave_test.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.wave_test.admin_wave_test.refund': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.wave_test.admin_wave_test.expire': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.notifications.admin_notifications.index': { paramsTuple?: []; params?: {} }
    'admin.notifications.admin_notifications.store': { paramsTuple?: []; params?: {} }
    'admin.stats.admin_stats.overview': { paramsTuple?: []; params?: {} }
    'admin.stats.admin_stats.revenue': { paramsTuple?: []; params?: {} }
    'admin.stats.admin_stats.subscriptions': { paramsTuple?: []; params?: {} }
    'admin.users.admin_users.index': { paramsTuple?: []; params?: {} }
    'admin.users.admin_users.store': { paramsTuple?: []; params?: {} }
    'admin.users.admin_users.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.users.admin_users.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.users.admin_users.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.users.admin_users.restore': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.users.admin_users.purge_preview': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.users.admin_users.purge': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.owners.admin_owners.index': { paramsTuple?: []; params?: {} }
    'admin.owners.admin_owners.pending': { paramsTuple?: []; params?: {} }
    'admin.owners.admin_owners.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.owners.admin_owners.profile': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.owners.admin_owners.portfolio': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.owners.admin_owners.validate': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.owners.admin_owners.reject': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.owners.admin_reports.police': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.properties.admin_properties.index': { paramsTuple?: []; params?: {} }
    'admin.properties.admin_properties.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.properties.admin_properties.clients': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.residences.admin_residences.index': { paramsTuple?: []; params?: {} }
    'admin.residences.admin_residences.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.bookings.admin_bookings.index': { paramsTuple?: []; params?: {} }
    'admin.bookings.admin_bookings.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.subscriptions.admin_subscriptions.index': { paramsTuple?: []; params?: {} }
    'admin.subscriptions.admin_subscriptions.cancel': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.subscriptions.admin_subscriptions.extend': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.promo_codes.admin_promo_codes.index': { paramsTuple?: []; params?: {} }
    'admin.promo_codes.admin_promo_codes.store': { paramsTuple?: []; params?: {} }
    'admin.promo_codes.admin_promo_codes.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.promo_codes.admin_promo_codes.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.sponsorships.admin_sponsorships.index': { paramsTuple?: []; params?: {} }
    'admin.sponsorships.admin_sponsorships.cancel': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.sponsorship_redemptions.admin_sponsorships.redemptions': { paramsTuple?: []; params?: {} }
    'admin.sponsorship_redemptions.admin_sponsorships.mark_paid': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.sponsorship_redemptions.admin_sponsorships.reject': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.sponsorship_settings.admin_sponsorships.settings': { paramsTuple?: []; params?: {} }
    'admin.sponsorship_settings.admin_sponsorships.update_settings': { paramsTuple?: []; params?: {} }
    'proprio.subscription': { paramsTuple?: []; params?: {} }
    'proprio.subscription_checkout': { paramsTuple?: []; params?: {} }
    'proprio.subscription_confirm': { paramsTuple: [ParamValue]; params: {'reference': ParamValue} }
    'proprio.subscription_options': { paramsTuple?: []; params?: {} }
    'proprio.subscription_cancel': { paramsTuple?: []; params?: {} }
    'proprio.plans': { paramsTuple?: []; params?: {} }
    'proprio.profile.proprio_profile.show': { paramsTuple?: []; params?: {} }
    'proprio.profile.proprio_profile.store': { paramsTuple?: []; params?: {} }
    'proprio.feedbacks.proprio_feedback.index': { paramsTuple?: []; params?: {} }
    'proprio.feedbacks.proprio_feedback.store': { paramsTuple?: []; params?: {} }
    'proprio.dashboard.proprio_property.stats': { paramsTuple?: []; params?: {} }
    'proprio.dashboard.proprio_booking.stats': { paramsTuple?: []; params?: {} }
    'proprio.dashboard.proprio_finance.performance': { paramsTuple?: []; params?: {} }
    'proprio.pro.client_book.proprio_client.index': { paramsTuple?: []; params?: {} }
    'proprio.pro.client_book.proprio_client.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.pro.client_book.proprio_client.bookings': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.pro.client_book.proprio_client.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.pro.expenses.proprio_expense.index': { paramsTuple?: []; params?: {} }
    'proprio.pro.expenses.proprio_expense.summary': { paramsTuple?: []; params?: {} }
    'proprio.pro.expenses.proprio_expense.store': { paramsTuple?: []; params?: {} }
    'proprio.pro.expenses.proprio_expense.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.pro.expenses.proprio_expense.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.pro.expenses.proprio_expense.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.pro.finance.proprio_finance.overview': { paramsTuple?: []; params?: {} }
    'proprio.pro_plus.reports.proprio_report.store': { paramsTuple?: []; params?: {} }
    'proprio.pro_plus.managers.proprio_manager.index': { paramsTuple?: []; params?: {} }
    'proprio.pro_plus.managers.proprio_manager.store': { paramsTuple?: []; params?: {} }
    'proprio.pro_plus.managers.proprio_manager.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.pro_plus.managers.proprio_manager.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.pro_plus.managers.proprio_manager.replace_properties': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.pro_plus.managers.proprio_manager.set_status': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.wallets.proprio_wallet.index': { paramsTuple?: []; params?: {} }
    'proprio.wallets.proprio_wallet.transactions': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.wallets.proprio_wallet.request_withdrawal': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.withdrawals': { paramsTuple?: []; params?: {} }
    'proprio.payout_settings': { paramsTuple?: []; params?: {} }
    'proprio.payout_numbers': { paramsTuple?: []; params?: {} }
    'proprio.properties.proprio_property.index': { paramsTuple?: []; params?: {} }
    'proprio.properties.proprio_property.availability': { paramsTuple?: []; params?: {} }
    'proprio.properties.proprio_property.store': { paramsTuple?: []; params?: {} }
    'proprio.properties.proprio_property_image.store': { paramsTuple?: []; params?: {} }
    'proprio.properties.proprio_property.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.properties.proprio_property.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.properties.proprio_property.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.properties.proprio_property.attach_residence': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.properties.proprio_property.publish': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.properties.proprio_property.unpublish': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.residences.proprio_residence.index': { paramsTuple?: []; params?: {} }
    'proprio.residences.proprio_residence.store': { paramsTuple?: []; params?: {} }
    'proprio.residences.proprio_residence.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.residences.proprio_residence.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.residences.proprio_residence.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.bookings.proprio_booking.index': { paramsTuple?: []; params?: {} }
    'proprio.bookings.proprio_booking.store': { paramsTuple?: []; params?: {} }
    'proprio.bookings.proprio_booking.cancel': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.bookings.proprio_booking.check_in': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.bookings.proprio_booking.check_out_preview': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.bookings.proprio_booking.check_out': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.bookings.proprio_booking.extend': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.bookings.proprio_booking.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.clients.proprio_client.lookup': { paramsTuple?: []; params?: {} }
    'proprio.clients.proprio_client.store': { paramsTuple?: []; params?: {} }
    'gerant.properties.gerant_property.index': { paramsTuple?: []; params?: {} }
    'gerant.properties.gerant_property.availability': { paramsTuple?: []; params?: {} }
    'gerant.properties.gerant_property.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.properties.gerant_property.update_availability': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.residences.gerant_residence.index': { paramsTuple?: []; params?: {} }
    'gerant.bookings.gerant_booking.index': { paramsTuple?: []; params?: {} }
    'gerant.bookings.gerant_booking.stats': { paramsTuple?: []; params?: {} }
    'gerant.bookings.gerant_booking.store': { paramsTuple?: []; params?: {} }
    'gerant.bookings.gerant_booking.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.bookings.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.bookings.replace': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.bookings.gerant_booking.cancel': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.bookings.gerant_booking.check_in': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.bookings.gerant_booking.check_out_preview': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.bookings.gerant_booking.check_out': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.bookings.extend': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.bookings.gerant_booking.record_payment': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.clients.gerant_client.index': { paramsTuple?: []; params?: {} }
    'gerant.clients.gerant_client.lookup': { paramsTuple?: []; params?: {} }
    'gerant.clients.gerant_client.store': { paramsTuple?: []; params?: {} }
    'gerant.clients.gerant_client.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.clients.gerant_client.bookings': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.clients.gerant_client.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.expenses.gerant_expense.index': { paramsTuple?: []; params?: {} }
    'gerant.expenses.gerant_expense.summary': { paramsTuple?: []; params?: {} }
    'gerant.expenses.gerant_expense.store': { paramsTuple?: []; params?: {} }
    'gerant.expenses.gerant_expense.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.expenses.gerant_expense.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.finance.gerant_finance.overview': { paramsTuple?: []; params?: {} }
    'gerant.profile.gerant_profile.show': { paramsTuple?: []; params?: {} }
    'gerant.profile.gerant_profile.update': { paramsTuple?: []; params?: {} }
    'client.properties.client_property.index': { paramsTuple?: []; params?: {} }
    'client.properties.client_property.search': { paramsTuple?: []; params?: {} }
    'client.properties.client_property.featured': { paramsTuple?: []; params?: {} }
    'client.properties.client_property.availability': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'client.properties.client_property.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'client.client_booking.store': { paramsTuple: [ParamValue]; params: {'property_id': ParamValue} }
    'client.client_negotiation.show': { paramsTuple: [ParamValue]; params: {'property_id': ParamValue} }
    'client.client_negotiation.next': { paramsTuple: [ParamValue]; params: {'property_id': ParamValue} }
    'client.bookings.client_booking.index': { paramsTuple?: []; params?: {} }
    'client.bookings.client_booking.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'client.bookings.client_booking.cancel': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'client.bookings.client_booking.apply_sponsorship_credit': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'client.bookings.client_booking_payment.initialize_wave': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'client.bookings.client_booking_payment.confirm_wave': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'sponsorship.sponsorship.check_code': { paramsTuple: [ParamValue]; params: {'code': ParamValue} }
    'sponsorship.sponsorship.show': { paramsTuple?: []; params?: {} }
    'sponsorship.sponsorship.apply': { paramsTuple?: []; params?: {} }
    'sponsorship.sponsorship.sponsored': { paramsTuple?: []; params?: {} }
    'sponsorship.sponsorship.transactions': { paramsTuple?: []; params?: {} }
    'sponsorship.sponsorship.redemptions': { paramsTuple?: []; params?: {} }
    'sponsorship.sponsorship.request_redemption': { paramsTuple?: []; params?: {} }
    'wave_webhook': { paramsTuple?: []; params?: {} }
    'booking_wave_return': { paramsTuple: [ParamValue]; params: {'booking_id': ParamValue} }
    'subscription_wave_webhook': { paramsTuple?: []; params?: {} }
    'subscription_wave_return': { paramsTuple: [ParamValue]; params: {'reference': ParamValue} }
    'wave_test_return': { paramsTuple?: []; params?: {} }
    'cron.cron.expire_trials': { paramsTuple?: []; params?: {} }
    'cron.cron.subscription_reminders': { paramsTuple?: []; params?: {} }
    'cron.cron.stay_statuses': { paramsTuple?: []; params?: {} }
    'cron.cron.sponsorship_rewards': { paramsTuple?: []; params?: {} }
    'cron.cron.purge_sessions': { paramsTuple?: []; params?: {} }
    'cron.cron.purge_audit_logs': { paramsTuple?: []; params?: {} }
    'cron.cron.health': { paramsTuple?: []; params?: {} }
  }
  GET: {
    'health': { paramsTuple?: []; params?: {} }
    'api_health': { paramsTuple?: []; params?: {} }
    'auth.protected.auth.me': { paramsTuple?: []; params?: {} }
    'admin.plans.admin_plans.index': { paramsTuple?: []; params?: {} }
    'admin.plans.admin_plans.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.audit_logs.admin_audit_logs.index': { paramsTuple?: []; params?: {} }
    'admin.audit_logs.admin_audit_logs.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.feedbacks.admin_feedback.index': { paramsTuple?: []; params?: {} }
    'admin.feedbacks.admin_feedback.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.withdrawals.admin_withdrawals.index': { paramsTuple?: []; params?: {} }
    'admin.withdrawals.admin_withdrawals.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.withdrawal_settings.admin_withdrawals.settings': { paramsTuple?: []; params?: {} }
    'admin.wave_test.admin_wave_test.config': { paramsTuple?: []; params?: {} }
    'admin.wave_test.admin_wave_test.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.notifications.admin_notifications.index': { paramsTuple?: []; params?: {} }
    'admin.stats.admin_stats.overview': { paramsTuple?: []; params?: {} }
    'admin.stats.admin_stats.revenue': { paramsTuple?: []; params?: {} }
    'admin.stats.admin_stats.subscriptions': { paramsTuple?: []; params?: {} }
    'admin.users.admin_users.index': { paramsTuple?: []; params?: {} }
    'admin.users.admin_users.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.users.admin_users.purge_preview': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.owners.admin_owners.index': { paramsTuple?: []; params?: {} }
    'admin.owners.admin_owners.pending': { paramsTuple?: []; params?: {} }
    'admin.owners.admin_owners.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.owners.admin_owners.profile': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.owners.admin_owners.portfolio': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.properties.admin_properties.index': { paramsTuple?: []; params?: {} }
    'admin.properties.admin_properties.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.properties.admin_properties.clients': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.residences.admin_residences.index': { paramsTuple?: []; params?: {} }
    'admin.residences.admin_residences.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.bookings.admin_bookings.index': { paramsTuple?: []; params?: {} }
    'admin.bookings.admin_bookings.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.subscriptions.admin_subscriptions.index': { paramsTuple?: []; params?: {} }
    'admin.promo_codes.admin_promo_codes.index': { paramsTuple?: []; params?: {} }
    'admin.sponsorships.admin_sponsorships.index': { paramsTuple?: []; params?: {} }
    'admin.sponsorship_redemptions.admin_sponsorships.redemptions': { paramsTuple?: []; params?: {} }
    'admin.sponsorship_settings.admin_sponsorships.settings': { paramsTuple?: []; params?: {} }
    'proprio.subscription': { paramsTuple?: []; params?: {} }
    'proprio.subscription_options': { paramsTuple?: []; params?: {} }
    'proprio.plans': { paramsTuple?: []; params?: {} }
    'proprio.profile.proprio_profile.show': { paramsTuple?: []; params?: {} }
    'proprio.feedbacks.proprio_feedback.index': { paramsTuple?: []; params?: {} }
    'proprio.dashboard.proprio_property.stats': { paramsTuple?: []; params?: {} }
    'proprio.dashboard.proprio_booking.stats': { paramsTuple?: []; params?: {} }
    'proprio.dashboard.proprio_finance.performance': { paramsTuple?: []; params?: {} }
    'proprio.pro.client_book.proprio_client.index': { paramsTuple?: []; params?: {} }
    'proprio.pro.client_book.proprio_client.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.pro.client_book.proprio_client.bookings': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.pro.expenses.proprio_expense.index': { paramsTuple?: []; params?: {} }
    'proprio.pro.expenses.proprio_expense.summary': { paramsTuple?: []; params?: {} }
    'proprio.pro.expenses.proprio_expense.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.pro.finance.proprio_finance.overview': { paramsTuple?: []; params?: {} }
    'proprio.pro_plus.managers.proprio_manager.index': { paramsTuple?: []; params?: {} }
    'proprio.pro_plus.managers.proprio_manager.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.wallets.proprio_wallet.index': { paramsTuple?: []; params?: {} }
    'proprio.wallets.proprio_wallet.transactions': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.withdrawals': { paramsTuple?: []; params?: {} }
    'proprio.payout_settings': { paramsTuple?: []; params?: {} }
    'proprio.properties.proprio_property.index': { paramsTuple?: []; params?: {} }
    'proprio.properties.proprio_property.availability': { paramsTuple?: []; params?: {} }
    'proprio.properties.proprio_property.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.residences.proprio_residence.index': { paramsTuple?: []; params?: {} }
    'proprio.residences.proprio_residence.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.bookings.proprio_booking.index': { paramsTuple?: []; params?: {} }
    'proprio.bookings.proprio_booking.check_out_preview': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.properties.gerant_property.index': { paramsTuple?: []; params?: {} }
    'gerant.properties.gerant_property.availability': { paramsTuple?: []; params?: {} }
    'gerant.properties.gerant_property.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.residences.gerant_residence.index': { paramsTuple?: []; params?: {} }
    'gerant.bookings.gerant_booking.index': { paramsTuple?: []; params?: {} }
    'gerant.bookings.gerant_booking.stats': { paramsTuple?: []; params?: {} }
    'gerant.bookings.gerant_booking.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.bookings.gerant_booking.check_out_preview': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.clients.gerant_client.index': { paramsTuple?: []; params?: {} }
    'gerant.clients.gerant_client.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.clients.gerant_client.bookings': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.expenses.gerant_expense.index': { paramsTuple?: []; params?: {} }
    'gerant.expenses.gerant_expense.summary': { paramsTuple?: []; params?: {} }
    'gerant.finance.gerant_finance.overview': { paramsTuple?: []; params?: {} }
    'gerant.profile.gerant_profile.show': { paramsTuple?: []; params?: {} }
    'client.properties.client_property.index': { paramsTuple?: []; params?: {} }
    'client.properties.client_property.search': { paramsTuple?: []; params?: {} }
    'client.properties.client_property.featured': { paramsTuple?: []; params?: {} }
    'client.properties.client_property.availability': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'client.properties.client_property.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'client.client_negotiation.show': { paramsTuple: [ParamValue]; params: {'property_id': ParamValue} }
    'client.bookings.client_booking.index': { paramsTuple?: []; params?: {} }
    'sponsorship.sponsorship.check_code': { paramsTuple: [ParamValue]; params: {'code': ParamValue} }
    'sponsorship.sponsorship.show': { paramsTuple?: []; params?: {} }
    'sponsorship.sponsorship.sponsored': { paramsTuple?: []; params?: {} }
    'sponsorship.sponsorship.transactions': { paramsTuple?: []; params?: {} }
    'sponsorship.sponsorship.redemptions': { paramsTuple?: []; params?: {} }
    'booking_wave_return': { paramsTuple: [ParamValue]; params: {'booking_id': ParamValue} }
    'subscription_wave_return': { paramsTuple: [ParamValue]; params: {'reference': ParamValue} }
    'wave_test_return': { paramsTuple?: []; params?: {} }
    'cron.cron.expire_trials': { paramsTuple?: []; params?: {} }
    'cron.cron.subscription_reminders': { paramsTuple?: []; params?: {} }
    'cron.cron.stay_statuses': { paramsTuple?: []; params?: {} }
    'cron.cron.sponsorship_rewards': { paramsTuple?: []; params?: {} }
    'cron.cron.purge_sessions': { paramsTuple?: []; params?: {} }
    'cron.cron.purge_audit_logs': { paramsTuple?: []; params?: {} }
    'cron.cron.health': { paramsTuple?: []; params?: {} }
  }
  HEAD: {
    'health': { paramsTuple?: []; params?: {} }
    'api_health': { paramsTuple?: []; params?: {} }
    'auth.protected.auth.me': { paramsTuple?: []; params?: {} }
    'admin.plans.admin_plans.index': { paramsTuple?: []; params?: {} }
    'admin.plans.admin_plans.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.audit_logs.admin_audit_logs.index': { paramsTuple?: []; params?: {} }
    'admin.audit_logs.admin_audit_logs.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.feedbacks.admin_feedback.index': { paramsTuple?: []; params?: {} }
    'admin.feedbacks.admin_feedback.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.withdrawals.admin_withdrawals.index': { paramsTuple?: []; params?: {} }
    'admin.withdrawals.admin_withdrawals.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.withdrawal_settings.admin_withdrawals.settings': { paramsTuple?: []; params?: {} }
    'admin.wave_test.admin_wave_test.config': { paramsTuple?: []; params?: {} }
    'admin.wave_test.admin_wave_test.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.notifications.admin_notifications.index': { paramsTuple?: []; params?: {} }
    'admin.stats.admin_stats.overview': { paramsTuple?: []; params?: {} }
    'admin.stats.admin_stats.revenue': { paramsTuple?: []; params?: {} }
    'admin.stats.admin_stats.subscriptions': { paramsTuple?: []; params?: {} }
    'admin.users.admin_users.index': { paramsTuple?: []; params?: {} }
    'admin.users.admin_users.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.users.admin_users.purge_preview': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.owners.admin_owners.index': { paramsTuple?: []; params?: {} }
    'admin.owners.admin_owners.pending': { paramsTuple?: []; params?: {} }
    'admin.owners.admin_owners.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.owners.admin_owners.profile': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.owners.admin_owners.portfolio': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.properties.admin_properties.index': { paramsTuple?: []; params?: {} }
    'admin.properties.admin_properties.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.properties.admin_properties.clients': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.residences.admin_residences.index': { paramsTuple?: []; params?: {} }
    'admin.residences.admin_residences.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.bookings.admin_bookings.index': { paramsTuple?: []; params?: {} }
    'admin.bookings.admin_bookings.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.subscriptions.admin_subscriptions.index': { paramsTuple?: []; params?: {} }
    'admin.promo_codes.admin_promo_codes.index': { paramsTuple?: []; params?: {} }
    'admin.sponsorships.admin_sponsorships.index': { paramsTuple?: []; params?: {} }
    'admin.sponsorship_redemptions.admin_sponsorships.redemptions': { paramsTuple?: []; params?: {} }
    'admin.sponsorship_settings.admin_sponsorships.settings': { paramsTuple?: []; params?: {} }
    'proprio.subscription': { paramsTuple?: []; params?: {} }
    'proprio.subscription_options': { paramsTuple?: []; params?: {} }
    'proprio.plans': { paramsTuple?: []; params?: {} }
    'proprio.profile.proprio_profile.show': { paramsTuple?: []; params?: {} }
    'proprio.feedbacks.proprio_feedback.index': { paramsTuple?: []; params?: {} }
    'proprio.dashboard.proprio_property.stats': { paramsTuple?: []; params?: {} }
    'proprio.dashboard.proprio_booking.stats': { paramsTuple?: []; params?: {} }
    'proprio.dashboard.proprio_finance.performance': { paramsTuple?: []; params?: {} }
    'proprio.pro.client_book.proprio_client.index': { paramsTuple?: []; params?: {} }
    'proprio.pro.client_book.proprio_client.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.pro.client_book.proprio_client.bookings': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.pro.expenses.proprio_expense.index': { paramsTuple?: []; params?: {} }
    'proprio.pro.expenses.proprio_expense.summary': { paramsTuple?: []; params?: {} }
    'proprio.pro.expenses.proprio_expense.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.pro.finance.proprio_finance.overview': { paramsTuple?: []; params?: {} }
    'proprio.pro_plus.managers.proprio_manager.index': { paramsTuple?: []; params?: {} }
    'proprio.pro_plus.managers.proprio_manager.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.wallets.proprio_wallet.index': { paramsTuple?: []; params?: {} }
    'proprio.wallets.proprio_wallet.transactions': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.withdrawals': { paramsTuple?: []; params?: {} }
    'proprio.payout_settings': { paramsTuple?: []; params?: {} }
    'proprio.properties.proprio_property.index': { paramsTuple?: []; params?: {} }
    'proprio.properties.proprio_property.availability': { paramsTuple?: []; params?: {} }
    'proprio.properties.proprio_property.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.residences.proprio_residence.index': { paramsTuple?: []; params?: {} }
    'proprio.residences.proprio_residence.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.bookings.proprio_booking.index': { paramsTuple?: []; params?: {} }
    'proprio.bookings.proprio_booking.check_out_preview': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.properties.gerant_property.index': { paramsTuple?: []; params?: {} }
    'gerant.properties.gerant_property.availability': { paramsTuple?: []; params?: {} }
    'gerant.properties.gerant_property.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.residences.gerant_residence.index': { paramsTuple?: []; params?: {} }
    'gerant.bookings.gerant_booking.index': { paramsTuple?: []; params?: {} }
    'gerant.bookings.gerant_booking.stats': { paramsTuple?: []; params?: {} }
    'gerant.bookings.gerant_booking.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.bookings.gerant_booking.check_out_preview': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.clients.gerant_client.index': { paramsTuple?: []; params?: {} }
    'gerant.clients.gerant_client.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.clients.gerant_client.bookings': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.expenses.gerant_expense.index': { paramsTuple?: []; params?: {} }
    'gerant.expenses.gerant_expense.summary': { paramsTuple?: []; params?: {} }
    'gerant.finance.gerant_finance.overview': { paramsTuple?: []; params?: {} }
    'gerant.profile.gerant_profile.show': { paramsTuple?: []; params?: {} }
    'client.properties.client_property.index': { paramsTuple?: []; params?: {} }
    'client.properties.client_property.search': { paramsTuple?: []; params?: {} }
    'client.properties.client_property.featured': { paramsTuple?: []; params?: {} }
    'client.properties.client_property.availability': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'client.properties.client_property.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'client.client_negotiation.show': { paramsTuple: [ParamValue]; params: {'property_id': ParamValue} }
    'client.bookings.client_booking.index': { paramsTuple?: []; params?: {} }
    'sponsorship.sponsorship.check_code': { paramsTuple: [ParamValue]; params: {'code': ParamValue} }
    'sponsorship.sponsorship.show': { paramsTuple?: []; params?: {} }
    'sponsorship.sponsorship.sponsored': { paramsTuple?: []; params?: {} }
    'sponsorship.sponsorship.transactions': { paramsTuple?: []; params?: {} }
    'sponsorship.sponsorship.redemptions': { paramsTuple?: []; params?: {} }
    'booking_wave_return': { paramsTuple: [ParamValue]; params: {'booking_id': ParamValue} }
    'subscription_wave_return': { paramsTuple: [ParamValue]; params: {'reference': ParamValue} }
    'wave_test_return': { paramsTuple?: []; params?: {} }
    'cron.cron.health': { paramsTuple?: []; params?: {} }
  }
  POST: {
    'auth.auth.register_init': { paramsTuple?: []; params?: {} }
    'auth.auth.register_resend': { paramsTuple?: []; params?: {} }
    'auth.auth.register_verify': { paramsTuple?: []; params?: {} }
    'auth.auth.login': { paramsTuple?: []; params?: {} }
    'auth.auth.google': { paramsTuple?: []; params?: {} }
    'auth.auth.refresh': { paramsTuple?: []; params?: {} }
    'auth.protected.auth.logout': { paramsTuple?: []; params?: {} }
    'auth.protected.device_token.store': { paramsTuple?: []; params?: {} }
    'admin.plans.admin_plans.store': { paramsTuple?: []; params?: {} }
    'admin.wave_test.admin_wave_test.checkout': { paramsTuple?: []; params?: {} }
    'admin.wave_test.admin_wave_test.refund': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.wave_test.admin_wave_test.expire': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.notifications.admin_notifications.store': { paramsTuple?: []; params?: {} }
    'admin.users.admin_users.store': { paramsTuple?: []; params?: {} }
    'admin.users.admin_users.restore': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.owners.admin_owners.validate': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.owners.admin_owners.reject': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.owners.admin_reports.police': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.promo_codes.admin_promo_codes.store': { paramsTuple?: []; params?: {} }
    'proprio.subscription_checkout': { paramsTuple?: []; params?: {} }
    'proprio.subscription_confirm': { paramsTuple: [ParamValue]; params: {'reference': ParamValue} }
    'proprio.subscription_cancel': { paramsTuple?: []; params?: {} }
    'proprio.profile.proprio_profile.store': { paramsTuple?: []; params?: {} }
    'proprio.feedbacks.proprio_feedback.store': { paramsTuple?: []; params?: {} }
    'proprio.pro.expenses.proprio_expense.store': { paramsTuple?: []; params?: {} }
    'proprio.pro_plus.reports.proprio_report.store': { paramsTuple?: []; params?: {} }
    'proprio.pro_plus.managers.proprio_manager.store': { paramsTuple?: []; params?: {} }
    'proprio.wallets.proprio_wallet.request_withdrawal': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.properties.proprio_property.store': { paramsTuple?: []; params?: {} }
    'proprio.properties.proprio_property_image.store': { paramsTuple?: []; params?: {} }
    'proprio.residences.proprio_residence.store': { paramsTuple?: []; params?: {} }
    'proprio.bookings.proprio_booking.store': { paramsTuple?: []; params?: {} }
    'proprio.clients.proprio_client.lookup': { paramsTuple?: []; params?: {} }
    'proprio.clients.proprio_client.store': { paramsTuple?: []; params?: {} }
    'gerant.bookings.gerant_booking.store': { paramsTuple?: []; params?: {} }
    'gerant.bookings.gerant_booking.record_payment': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.clients.gerant_client.lookup': { paramsTuple?: []; params?: {} }
    'gerant.clients.gerant_client.store': { paramsTuple?: []; params?: {} }
    'gerant.expenses.gerant_expense.store': { paramsTuple?: []; params?: {} }
    'client.client_booking.store': { paramsTuple: [ParamValue]; params: {'property_id': ParamValue} }
    'client.client_negotiation.next': { paramsTuple: [ParamValue]; params: {'property_id': ParamValue} }
    'client.bookings.client_booking.apply_sponsorship_credit': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'client.bookings.client_booking_payment.initialize_wave': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'client.bookings.client_booking_payment.confirm_wave': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'sponsorship.sponsorship.apply': { paramsTuple?: []; params?: {} }
    'sponsorship.sponsorship.request_redemption': { paramsTuple?: []; params?: {} }
    'wave_webhook': { paramsTuple?: []; params?: {} }
    'subscription_wave_webhook': { paramsTuple?: []; params?: {} }
    'cron.cron.expire_trials': { paramsTuple?: []; params?: {} }
    'cron.cron.subscription_reminders': { paramsTuple?: []; params?: {} }
    'cron.cron.stay_statuses': { paramsTuple?: []; params?: {} }
    'cron.cron.sponsorship_rewards': { paramsTuple?: []; params?: {} }
    'cron.cron.purge_sessions': { paramsTuple?: []; params?: {} }
    'cron.cron.purge_audit_logs': { paramsTuple?: []; params?: {} }
  }
  DELETE: {
    'auth.protected.device_token.destroy': { paramsTuple?: []; params?: {} }
    'admin.plans.admin_plans.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.users.admin_users.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.users.admin_users.purge': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.promo_codes.admin_promo_codes.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.pro.expenses.proprio_expense.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.properties.proprio_property.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.residences.proprio_residence.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.expenses.gerant_expense.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  PATCH: {
    'admin.plans.admin_plans.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.feedbacks.admin_feedback.update_status': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.withdrawals.admin_withdrawals.mark_paid': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.withdrawals.admin_withdrawals.reject': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.users.admin_users.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.subscriptions.admin_subscriptions.cancel': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.subscriptions.admin_subscriptions.extend': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.promo_codes.admin_promo_codes.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.sponsorships.admin_sponsorships.cancel': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.sponsorship_redemptions.admin_sponsorships.mark_paid': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.sponsorship_redemptions.admin_sponsorships.reject': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.pro.client_book.proprio_client.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.pro.expenses.proprio_expense.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.pro_plus.managers.proprio_manager.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.pro_plus.managers.proprio_manager.set_status': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.properties.proprio_property.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.properties.proprio_property.attach_residence': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.properties.proprio_property.publish': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.properties.proprio_property.unpublish': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.residences.proprio_residence.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.bookings.proprio_booking.cancel': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.bookings.proprio_booking.check_in': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.bookings.proprio_booking.check_out': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.bookings.proprio_booking.extend': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.properties.gerant_property.update_availability': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.bookings.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.bookings.gerant_booking.cancel': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.bookings.gerant_booking.check_in': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.bookings.gerant_booking.check_out': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.bookings.extend': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.clients.gerant_client.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.expenses.gerant_expense.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.profile.gerant_profile.update': { paramsTuple?: []; params?: {} }
    'client.bookings.client_booking.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'client.bookings.client_booking.cancel': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  PUT: {
    'admin.withdrawal_settings.admin_withdrawals.update_settings': { paramsTuple?: []; params?: {} }
    'admin.sponsorship_settings.admin_sponsorships.update_settings': { paramsTuple?: []; params?: {} }
    'proprio.pro_plus.managers.proprio_manager.replace_properties': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'proprio.payout_numbers': { paramsTuple?: []; params?: {} }
    'proprio.bookings.proprio_booking.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gerant.bookings.replace': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}