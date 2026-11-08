/* eslint-disable prettier/prettier */
/// <reference path="../manifest.d.ts" />

import type { ExtractBody, ExtractErrorResponse, ExtractQuery, ExtractQueryForGet, ExtractResponse } from '@tuyau/core/types'
import type { InferInput, SimpleError } from '@vinejs/vine/types'

export type ParamValue = string | number | bigint | boolean

export interface Registry {
  'health': {
    methods: ["GET","HEAD"]
    pattern: '/health'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/health_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/health_controller').default['show']>>>
    }
  }
  'api_health': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/health'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/health_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/health_controller').default['show']>>>
    }
  }
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
  'auth.auth.register_resend': {
    methods: ["POST"]
    pattern: '/api/v1/auth/register/resend'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/auth/auth').registerResendValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/auth/auth').registerResendValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/auth/auth_controller').default['registerResend']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/auth/auth_controller').default['registerResend']>>> | { status: 422; response: { errors: SimpleError[] } }
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
  'auth.protected.device_token.store': {
    methods: ["POST"]
    pattern: '/api/v1/auth/device-tokens'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/notification/notification').registerDeviceTokenValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/notification/notification').registerDeviceTokenValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/auth/device_token_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/auth/device_token_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'auth.protected.device_token.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/auth/device-tokens'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/notification/notification').unregisterDeviceTokenValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/notification/notification').unregisterDeviceTokenValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/auth/device_token_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/auth/device_token_controller').default['destroy']>>> | { status: 422; response: { errors: SimpleError[] } }
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
  'admin.audit_logs.admin_audit_logs.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/audit-logs'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/audit_log/audit_log').listAuditLogsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/audit_logs_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/audit_logs_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.audit_logs.admin_audit_logs.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/audit-logs/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/audit_logs_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/audit_logs_controller').default['show']>>>
    }
  }
  'admin.feedbacks.admin_feedback.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/feedbacks'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/feedback/feedback').listFeedbacksValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/feedback_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/feedback_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.feedbacks.admin_feedback.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/feedbacks/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/feedback_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/feedback_controller').default['show']>>>
    }
  }
  'admin.feedbacks.admin_feedback.update_status': {
    methods: ["PATCH"]
    pattern: '/api/v1/admin/feedbacks/:id/status'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/feedback/feedback').updateFeedbackStatusValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/feedback/feedback').updateFeedbackStatusValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/feedback_controller').default['updateStatus']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/feedback_controller').default['updateStatus']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.withdrawals.admin_withdrawals.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/withdrawals'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/wallet/wallet').listWithdrawalsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/withdrawals_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/withdrawals_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.withdrawals.admin_withdrawals.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/withdrawals/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/withdrawals_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/withdrawals_controller').default['show']>>>
    }
  }
  'admin.withdrawals.admin_withdrawals.mark_paid': {
    methods: ["PATCH"]
    pattern: '/api/v1/admin/withdrawals/:id/paid'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/wallet/wallet').markWithdrawalPaidValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/wallet/wallet').markWithdrawalPaidValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/withdrawals_controller').default['markPaid']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/withdrawals_controller').default['markPaid']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.withdrawals.admin_withdrawals.reject': {
    methods: ["PATCH"]
    pattern: '/api/v1/admin/withdrawals/:id/reject'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/wallet/wallet').rejectWithdrawalValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/wallet/wallet').rejectWithdrawalValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/withdrawals_controller').default['reject']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/withdrawals_controller').default['reject']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.withdrawal_settings.admin_withdrawals.settings': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/settings/withdrawals'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/withdrawals_controller').default['settings']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/withdrawals_controller').default['settings']>>>
    }
  }
  'admin.withdrawal_settings.admin_withdrawals.update_settings': {
    methods: ["PUT"]
    pattern: '/api/v1/admin/settings/withdrawals'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/wallet/wallet').updateWithdrawalSettingsValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/wallet/wallet').updateWithdrawalSettingsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/withdrawals_controller').default['updateSettings']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/withdrawals_controller').default['updateSettings']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.wave_test.admin_wave_test.config': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/wave-test/config'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/wave_test_controller').default['config']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/wave_test_controller').default['config']>>>
    }
  }
  'admin.wave_test.admin_wave_test.checkout': {
    methods: ["POST"]
    pattern: '/api/v1/admin/wave-test/checkout'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/wave/wave_test').waveTestCheckoutValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/wave/wave_test').waveTestCheckoutValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/wave_test_controller').default['checkout']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/wave_test_controller').default['checkout']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.wave_test.admin_wave_test.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/wave-test/checkout/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/wave_test_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/wave_test_controller').default['show']>>>
    }
  }
  'admin.wave_test.admin_wave_test.refund': {
    methods: ["POST"]
    pattern: '/api/v1/admin/wave-test/checkout/:id/refund'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/wave_test_controller').default['refund']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/wave_test_controller').default['refund']>>>
    }
  }
  'admin.wave_test.admin_wave_test.expire': {
    methods: ["POST"]
    pattern: '/api/v1/admin/wave-test/checkout/:id/expire'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/wave_test_controller').default['expire']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/wave_test_controller').default['expire']>>>
    }
  }
  'admin.notifications.admin_notifications.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/notifications'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/notification/notification').listNotificationCampaignsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/notifications_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/notifications_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.notifications.admin_notifications.store': {
    methods: ["POST"]
    pattern: '/api/v1/admin/notifications'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/notification/notification').sendAdminNotificationValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/notification/notification').sendAdminNotificationValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/notifications_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/notifications_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.stats.admin_stats.overview': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/stats'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/stats_controller').default['overview']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/stats_controller').default['overview']>>>
    }
  }
  'admin.stats.admin_stats.revenue': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/stats/revenue'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/stats/stats').revenueSeriesValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/stats_controller').default['revenue']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/stats_controller').default['revenue']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.stats.admin_stats.subscriptions': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/stats/subscriptions'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/stats/stats').subscriptionRevenueValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/stats_controller').default['subscriptions']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/stats_controller').default['subscriptions']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.users.admin_users.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/users'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/user/user').listUsersValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/users_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/users_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.users.admin_users.store': {
    methods: ["POST"]
    pattern: '/api/v1/admin/users'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/user/user').createUserValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/user/user').createUserValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/users_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/users_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.users.admin_users.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/users/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/users_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/users_controller').default['show']>>>
    }
  }
  'admin.users.admin_users.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/admin/users/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/user/user').updateUserValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/user/user').updateUserValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/users_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/users_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.users.admin_users.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/admin/users/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/users_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/users_controller').default['destroy']>>>
    }
  }
  'admin.users.admin_users.restore': {
    methods: ["POST"]
    pattern: '/api/v1/admin/users/:id/restore'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/users_controller').default['restore']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/users_controller').default['restore']>>>
    }
  }
  'admin.users.admin_users.purge_preview': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/users/:id/purge'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/users_controller').default['purgePreview']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/users_controller').default['purgePreview']>>>
    }
  }
  'admin.users.admin_users.purge': {
    methods: ["DELETE"]
    pattern: '/api/v1/admin/users/:id/purge'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/users_controller').default['purge']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/users_controller').default['purge']>>>
    }
  }
  'admin.owners.admin_owners.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/owners'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/subscription/owner').listOwnersValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/owners_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/owners_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.owners.admin_owners.pending': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/owners/pending'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/subscription/owner').listOwnersValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/owners_controller').default['pending']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/owners_controller').default['pending']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.owners.admin_owners.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/owners/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/owners_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/owners_controller').default['show']>>>
    }
  }
  'admin.owners.admin_owners.profile': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/owners/:id/profile'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/owners_controller').default['profile']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/owners_controller').default['profile']>>>
    }
  }
  'admin.owners.admin_owners.portfolio': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/owners/:id/portfolio'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/owners_controller').default['portfolio']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/owners_controller').default['portfolio']>>>
    }
  }
  'admin.owners.admin_owners.validate': {
    methods: ["POST"]
    pattern: '/api/v1/admin/owners/:id/validate'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/owners_controller').default['validate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/owners_controller').default['validate']>>>
    }
  }
  'admin.owners.admin_owners.reject': {
    methods: ["POST"]
    pattern: '/api/v1/admin/owners/:id/reject'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/subscription/owner').rejectOwnerValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/subscription/owner').rejectOwnerValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/owners_controller').default['reject']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/owners_controller').default['reject']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.owners.admin_reports.police': {
    methods: ["POST"]
    pattern: '/api/v1/admin/owners/:id/reports/police'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/report/report').generatePoliceReportValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/report/report').generatePoliceReportValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/reports_controller').default['police']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/reports_controller').default['police']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.properties.admin_properties.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/properties'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/property/property').listPlatformPropertiesValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/properties_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/properties_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.properties.admin_properties.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/properties/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/properties_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/properties_controller').default['show']>>>
    }
  }
  'admin.properties.admin_properties.clients': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/properties/:id/clients'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/properties_controller').default['clients']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/properties_controller').default['clients']>>>
    }
  }
  'admin.residences.admin_residences.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/residences'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/residence/residence').listPlatformResidencesValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/residences_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/residences_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.residences.admin_residences.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/residences/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/residences_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/residences_controller').default['show']>>>
    }
  }
  'admin.bookings.admin_bookings.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/bookings'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/booking/booking').listPlatformBookingsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/bookings_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/bookings_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.bookings.admin_bookings.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/bookings/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/bookings_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/bookings_controller').default['show']>>>
    }
  }
  'admin.subscriptions.admin_subscriptions.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/subscriptions'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/subscription/subscription').listSubscriptionsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/subscriptions_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/subscriptions_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.subscriptions.admin_subscriptions.cancel': {
    methods: ["PATCH"]
    pattern: '/api/v1/admin/subscriptions/:id/cancel'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/subscription/subscription').cancelSubscriptionValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/subscription/subscription').cancelSubscriptionValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/subscriptions_controller').default['cancel']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/subscriptions_controller').default['cancel']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.subscriptions.admin_subscriptions.extend': {
    methods: ["PATCH"]
    pattern: '/api/v1/admin/subscriptions/:id/extend'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/subscription/subscription').extendSubscriptionValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/subscription/subscription').extendSubscriptionValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/subscriptions_controller').default['extend']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/subscriptions_controller').default['extend']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.promo_codes.admin_promo_codes.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/promo-codes'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/promo_codes_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/promo_codes_controller').default['index']>>>
    }
  }
  'admin.promo_codes.admin_promo_codes.store': {
    methods: ["POST"]
    pattern: '/api/v1/admin/promo-codes'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/promo_code/promo_code').createPromoCodeValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/promo_code/promo_code').createPromoCodeValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/promo_codes_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/promo_codes_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.promo_codes.admin_promo_codes.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/admin/promo-codes/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/promo_code/promo_code').updatePromoCodeValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/promo_code/promo_code').updatePromoCodeValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/promo_codes_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/promo_codes_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.promo_codes.admin_promo_codes.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/admin/promo-codes/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/promo_codes_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/promo_codes_controller').default['destroy']>>>
    }
  }
  'admin.sponsorships.admin_sponsorships.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/sponsorships'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/sponsorship/sponsorship').listAdminSponsorshipsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/sponsorships_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/sponsorships_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.sponsorships.admin_sponsorships.cancel': {
    methods: ["PATCH"]
    pattern: '/api/v1/admin/sponsorships/:id/cancel'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/sponsorship/sponsorship').cancelSponsorshipValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/sponsorship/sponsorship').cancelSponsorshipValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/sponsorships_controller').default['cancel']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/sponsorships_controller').default['cancel']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.sponsorship_redemptions.admin_sponsorships.redemptions': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/sponsorship-redemptions'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/sponsorship/sponsorship').listRedemptionsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/sponsorships_controller').default['redemptions']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/sponsorships_controller').default['redemptions']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.sponsorship_redemptions.admin_sponsorships.mark_paid': {
    methods: ["PATCH"]
    pattern: '/api/v1/admin/sponsorship-redemptions/:id/paid'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/sponsorship/sponsorship').markRedemptionPaidValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/sponsorship/sponsorship').markRedemptionPaidValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/sponsorships_controller').default['markPaid']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/sponsorships_controller').default['markPaid']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.sponsorship_redemptions.admin_sponsorships.reject': {
    methods: ["PATCH"]
    pattern: '/api/v1/admin/sponsorship-redemptions/:id/reject'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/sponsorship/sponsorship').rejectRedemptionValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/sponsorship/sponsorship').rejectRedemptionValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/sponsorships_controller').default['reject']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/sponsorships_controller').default['reject']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.sponsorship_settings.admin_sponsorships.settings': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/settings/sponsorships'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/sponsorships_controller').default['settings']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/sponsorships_controller').default['settings']>>>
    }
  }
  'admin.sponsorship_settings.admin_sponsorships.update_settings': {
    methods: ["PUT"]
    pattern: '/api/v1/admin/settings/sponsorships'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/sponsorship/sponsorship').updateSponsorshipSettingsValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/sponsorship/sponsorship').updateSponsorshipSettingsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/sponsorships_controller').default['updateSettings']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/sponsorships_controller').default['updateSettings']>>> | { status: 422; response: { errors: SimpleError[] } }
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
  'proprio.subscription_checkout': {
    methods: ["POST"]
    pattern: '/api/v1/proprio/subscription/checkout'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/subscription/subscription').subscriptionCheckoutValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/subscription/subscription').subscriptionCheckoutValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/subscription_payment_controller').default['checkout']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/subscription_payment_controller').default['checkout']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'proprio.subscription_confirm': {
    methods: ["POST"]
    pattern: '/api/v1/proprio/subscription/checkout/:reference/confirm'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { reference: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/subscription_payment_controller').default['confirm']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/subscription_payment_controller').default['confirm']>>>
    }
  }
  'proprio.subscription_options': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/proprio/subscription/options'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/subscription_payment_controller').default['options']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/subscription_payment_controller').default['options']>>>
    }
  }
  'proprio.subscription_cancel': {
    methods: ["POST"]
    pattern: '/api/v1/proprio/subscription/cancel'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/subscription_payment_controller').default['cancel']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/subscription_payment_controller').default['cancel']>>>
    }
  }
  'proprio.plans': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/proprio/plans'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/subscription_payment_controller').default['plans']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/subscription_payment_controller').default['plans']>>>
    }
  }
  'proprio.profile.proprio_profile.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/proprio/profile'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/profile_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/profile_controller').default['show']>>>
    }
  }
  'proprio.profile.proprio_profile.store': {
    methods: ["POST"]
    pattern: '/api/v1/proprio/profile'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/owner/owner_profile').submitOwnerProfileValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/owner/owner_profile').submitOwnerProfileValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/profile_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/profile_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'proprio.feedbacks.proprio_feedback.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/proprio/feedbacks'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/feedback/feedback').listFeedbacksValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/feedback_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/feedback_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'proprio.feedbacks.proprio_feedback.store': {
    methods: ["POST"]
    pattern: '/api/v1/proprio/feedbacks'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/feedback/feedback').createFeedbackValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/feedback/feedback').createFeedbackValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/feedback_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/feedback_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'proprio.dashboard.proprio_property.stats': {
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
  'proprio.dashboard.proprio_booking.stats': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/proprio/bookings/stats'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/booking_controller').default['stats']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/booking_controller').default['stats']>>>
    }
  }
  'proprio.dashboard.proprio_finance.performance': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/proprio/finance/performance'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/finance/finance').financeOverviewValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/finance_controller').default['performance']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/finance_controller').default['performance']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'proprio.pro.client_book.proprio_client.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/proprio/clients'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/client/client').listClientsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/client_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/client_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'proprio.pro.client_book.proprio_client.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/proprio/clients/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/client_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/client_controller').default['show']>>>
    }
  }
  'proprio.pro.client_book.proprio_client.bookings': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/proprio/clients/:id/bookings'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/client_controller').default['bookings']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/client_controller').default['bookings']>>>
    }
  }
  'proprio.pro.client_book.proprio_client.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/proprio/clients/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/client/client').updateClientValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/client/client').updateClientValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/client_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/client_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'proprio.pro.expenses.proprio_expense.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/proprio/expenses'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/expense/expense').listExpensesValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/expense_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/expense_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'proprio.pro.expenses.proprio_expense.summary': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/proprio/expenses/summary'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/expense/expense').listExpensesValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/expense_controller').default['summary']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/expense_controller').default['summary']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'proprio.pro.expenses.proprio_expense.store': {
    methods: ["POST"]
    pattern: '/api/v1/proprio/expenses'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/expense/expense').createExpenseValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/expense/expense').createExpenseValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/expense_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/expense_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'proprio.pro.expenses.proprio_expense.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/proprio/expenses/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/expense_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/expense_controller').default['show']>>>
    }
  }
  'proprio.pro.expenses.proprio_expense.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/proprio/expenses/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/expense/expense').updateExpenseValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/expense/expense').updateExpenseValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/expense_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/expense_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'proprio.pro.expenses.proprio_expense.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/proprio/expenses/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/expense_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/expense_controller').default['destroy']>>>
    }
  }
  'proprio.pro.finance.proprio_finance.overview': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/proprio/finance/overview'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/finance/finance').financeOverviewValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/finance_controller').default['overview']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/finance_controller').default['overview']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'proprio.pro_plus.reports.proprio_report.store': {
    methods: ["POST"]
    pattern: '/api/v1/proprio/reports'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/report/report').generateReportValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/report/report').generateReportValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/report_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/report_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'proprio.pro_plus.managers.proprio_manager.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/proprio/managers'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/manager_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/manager_controller').default['index']>>>
    }
  }
  'proprio.pro_plus.managers.proprio_manager.store': {
    methods: ["POST"]
    pattern: '/api/v1/proprio/managers'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/manager/manager').createManagerValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/manager/manager').createManagerValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/manager_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/manager_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'proprio.pro_plus.managers.proprio_manager.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/proprio/managers/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/manager_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/manager_controller').default['show']>>>
    }
  }
  'proprio.pro_plus.managers.proprio_manager.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/proprio/managers/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/manager/manager').updateManagerValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/manager/manager').updateManagerValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/manager_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/manager_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'proprio.pro_plus.managers.proprio_manager.replace_properties': {
    methods: ["PUT"]
    pattern: '/api/v1/proprio/managers/:id/properties'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/manager/manager').updateManagerPropertiesValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/manager/manager').updateManagerPropertiesValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/manager_controller').default['replaceProperties']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/manager_controller').default['replaceProperties']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'proprio.pro_plus.managers.proprio_manager.set_status': {
    methods: ["PATCH"]
    pattern: '/api/v1/proprio/managers/:id/status'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/manager/manager').setManagerStatusValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/manager/manager').setManagerStatusValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/manager_controller').default['setStatus']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/manager_controller').default['setStatus']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'proprio.wallets.proprio_wallet.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/proprio/wallets'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/wallet_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/wallet_controller').default['index']>>>
    }
  }
  'proprio.wallets.proprio_wallet.transactions': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/proprio/wallets/:id/transactions'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/wallet/wallet').listWalletTransactionsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/wallet_controller').default['transactions']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/wallet_controller').default['transactions']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'proprio.wallets.proprio_wallet.request_withdrawal': {
    methods: ["POST"]
    pattern: '/api/v1/proprio/wallets/:id/withdrawals'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/wallet/wallet').requestWithdrawalValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/wallet/wallet').requestWithdrawalValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/wallet_controller').default['requestWithdrawal']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/wallet_controller').default['requestWithdrawal']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'proprio.withdrawals': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/proprio/withdrawals'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/wallet/wallet').listWithdrawalsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/wallet_controller').default['withdrawals']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/wallet_controller').default['withdrawals']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'proprio.payout_settings': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/proprio/payout-settings'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/wallet_controller').default['payoutSettings']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/wallet_controller').default['payoutSettings']>>>
    }
  }
  'proprio.payout_numbers': {
    methods: ["PUT"]
    pattern: '/api/v1/proprio/payout-numbers'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/wallet/wallet').savePayoutNumbersValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/wallet/wallet').savePayoutNumbersValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/wallet_controller').default['savePayoutNumbers']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/wallet_controller').default['savePayoutNumbers']>>> | { status: 422; response: { errors: SimpleError[] } }
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
  'proprio.properties.proprio_property.availability': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/proprio/properties/availability'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/booking/booking').availabilityValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/property_controller').default['availability']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/property_controller').default['availability']>>> | { status: 422; response: { errors: SimpleError[] } }
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
  'proprio.properties.proprio_property_image.store': {
    methods: ["POST"]
    pattern: '/api/v1/proprio/properties/images'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/property_image_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/property_image_controller').default['store']>>>
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
  'proprio.properties.proprio_property.attach_residence': {
    methods: ["PATCH"]
    pattern: '/api/v1/proprio/properties/:id/residence'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/residence/residence').attachResidenceValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/residence/residence').attachResidenceValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/property_controller').default['attachResidence']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/property_controller').default['attachResidence']>>> | { status: 422; response: { errors: SimpleError[] } }
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
  'proprio.residences.proprio_residence.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/proprio/residences'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/residence/residence').listResidencesValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/residence_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/residence_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'proprio.residences.proprio_residence.store': {
    methods: ["POST"]
    pattern: '/api/v1/proprio/residences'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/residence/residence').createResidenceValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/residence/residence').createResidenceValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/residence_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/residence_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'proprio.residences.proprio_residence.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/proprio/residences/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/residence_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/residence_controller').default['show']>>>
    }
  }
  'proprio.residences.proprio_residence.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/proprio/residences/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/residence/residence').updateResidenceValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/residence/residence').updateResidenceValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/residence_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/residence_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'proprio.residences.proprio_residence.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/proprio/residences/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/residence_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/residence_controller').default['destroy']>>>
    }
  }
  'proprio.bookings.proprio_booking.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/proprio/bookings'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/booking/booking').listBookingsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/booking_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/booking_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'proprio.bookings.proprio_booking.store': {
    methods: ["POST"]
    pattern: '/api/v1/proprio/bookings'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/booking/booking').createOwnerBookingValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/booking/booking').createOwnerBookingValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/booking_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/booking_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'proprio.bookings.proprio_booking.cancel': {
    methods: ["PATCH"]
    pattern: '/api/v1/proprio/bookings/:id/cancel'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/booking/booking').cancelBookingValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/booking/booking').cancelBookingValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/booking_controller').default['cancel']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/booking_controller').default['cancel']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'proprio.bookings.proprio_booking.check_in': {
    methods: ["PATCH"]
    pattern: '/api/v1/proprio/bookings/:id/check-in'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/booking/booking').checkInBookingValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/booking/booking').checkInBookingValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/booking_controller').default['checkIn']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/booking_controller').default['checkIn']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'proprio.bookings.proprio_booking.check_out_preview': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/proprio/bookings/:id/check-out/preview'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/booking/booking').checkOutPreviewValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/booking_controller').default['checkOutPreview']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/booking_controller').default['checkOutPreview']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'proprio.bookings.proprio_booking.check_out': {
    methods: ["PATCH"]
    pattern: '/api/v1/proprio/bookings/:id/check-out'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/booking/booking').checkOutBookingValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/booking/booking').checkOutBookingValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/booking_controller').default['checkOut']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/booking_controller').default['checkOut']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'proprio.bookings.proprio_booking.extend': {
    methods: ["PATCH"]
    pattern: '/api/v1/proprio/bookings/:id/extend'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/booking/booking').extendOwnerBookingValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/booking/booking').extendOwnerBookingValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/booking_controller').default['extend']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/booking_controller').default['extend']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'proprio.bookings.proprio_booking.update': {
    methods: ["PUT"]
    pattern: '/api/v1/proprio/bookings/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/booking/booking').updateOwnerBookingValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/booking/booking').updateOwnerBookingValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/booking_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/booking_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'proprio.clients.proprio_client.lookup': {
    methods: ["POST"]
    pattern: '/api/v1/proprio/clients/lookup'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/client/client').lookupClientValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/client/client').lookupClientValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/client_controller').default['lookup']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/client_controller').default['lookup']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'proprio.clients.proprio_client.store': {
    methods: ["POST"]
    pattern: '/api/v1/proprio/clients'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/client/client').createClientValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/client/client').createClientValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/client_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/client_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'gerant.properties.gerant_property.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/gerant/properties'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/property/property').listOwnerPropertiesValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gerant/property_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gerant/property_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'gerant.properties.gerant_property.availability': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/gerant/properties/availability'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/booking/booking').availabilityValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gerant/property_controller').default['availability']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gerant/property_controller').default['availability']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'gerant.properties.gerant_property.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/gerant/properties/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gerant/property_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gerant/property_controller').default['show']>>>
    }
  }
  'gerant.properties.gerant_property.update_availability': {
    methods: ["PATCH"]
    pattern: '/api/v1/gerant/properties/:id/availability'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/property/property').updateAvailabilityValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/property/property').updateAvailabilityValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gerant/property_controller').default['updateAvailability']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gerant/property_controller').default['updateAvailability']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'gerant.residences.gerant_residence.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/gerant/residences'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gerant/residence_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gerant/residence_controller').default['index']>>>
    }
  }
  'gerant.bookings.gerant_booking.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/gerant/bookings'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/booking/booking').listBookingsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gerant/booking_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gerant/booking_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'gerant.bookings.gerant_booking.stats': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/gerant/bookings/stats'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gerant/booking_controller').default['stats']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gerant/booking_controller').default['stats']>>>
    }
  }
  'gerant.bookings.gerant_booking.store': {
    methods: ["POST"]
    pattern: '/api/v1/gerant/bookings'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/booking/booking').createOwnerBookingValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/booking/booking').createOwnerBookingValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gerant/booking_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gerant/booking_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'gerant.bookings.gerant_booking.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/gerant/bookings/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gerant/booking_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gerant/booking_controller').default['show']>>>
    }
  }
  'gerant.bookings.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/gerant/bookings/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/booking/booking').extendOwnerBookingValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/booking/booking').extendOwnerBookingValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gerant/booking_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gerant/booking_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'gerant.bookings.replace': {
    methods: ["PUT"]
    pattern: '/api/v1/gerant/bookings/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/booking/booking').updateOwnerBookingValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/booking/booking').updateOwnerBookingValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gerant/booking_controller').default['replace']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gerant/booking_controller').default['replace']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'gerant.bookings.gerant_booking.cancel': {
    methods: ["PATCH"]
    pattern: '/api/v1/gerant/bookings/:id/cancel'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/booking/booking').cancelBookingValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/booking/booking').cancelBookingValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gerant/booking_controller').default['cancel']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gerant/booking_controller').default['cancel']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'gerant.bookings.gerant_booking.check_in': {
    methods: ["PATCH"]
    pattern: '/api/v1/gerant/bookings/:id/check-in'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/booking/booking').checkInBookingValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/booking/booking').checkInBookingValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gerant/booking_controller').default['checkIn']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gerant/booking_controller').default['checkIn']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'gerant.bookings.gerant_booking.check_out_preview': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/gerant/bookings/:id/check-out/preview'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/booking/booking').checkOutPreviewValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gerant/booking_controller').default['checkOutPreview']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gerant/booking_controller').default['checkOutPreview']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'gerant.bookings.gerant_booking.check_out': {
    methods: ["PATCH"]
    pattern: '/api/v1/gerant/bookings/:id/check-out'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/booking/booking').checkOutBookingValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/booking/booking').checkOutBookingValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gerant/booking_controller').default['checkOut']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gerant/booking_controller').default['checkOut']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'gerant.bookings.extend': {
    methods: ["PATCH"]
    pattern: '/api/v1/gerant/bookings/:id/extend'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/booking/booking').extendOwnerBookingValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/booking/booking').extendOwnerBookingValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gerant/booking_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gerant/booking_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'gerant.bookings.gerant_booking.record_payment': {
    methods: ["POST"]
    pattern: '/api/v1/gerant/bookings/:id/payments'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/booking/booking').recordBookingPaymentValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/booking/booking').recordBookingPaymentValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gerant/booking_controller').default['recordPayment']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gerant/booking_controller').default['recordPayment']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'gerant.clients.gerant_client.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/gerant/clients'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/client/client').listClientsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gerant/client_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gerant/client_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'gerant.clients.gerant_client.lookup': {
    methods: ["POST"]
    pattern: '/api/v1/gerant/clients/lookup'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/client/client').lookupClientValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/client/client').lookupClientValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gerant/client_controller').default['lookup']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gerant/client_controller').default['lookup']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'gerant.clients.gerant_client.store': {
    methods: ["POST"]
    pattern: '/api/v1/gerant/clients'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/client/client').createClientValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/client/client').createClientValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gerant/client_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gerant/client_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'gerant.clients.gerant_client.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/gerant/clients/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gerant/client_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gerant/client_controller').default['show']>>>
    }
  }
  'gerant.clients.gerant_client.bookings': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/gerant/clients/:id/bookings'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gerant/client_controller').default['bookings']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gerant/client_controller').default['bookings']>>>
    }
  }
  'gerant.clients.gerant_client.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/gerant/clients/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/client/client').updateClientValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/client/client').updateClientValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gerant/client_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gerant/client_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'gerant.expenses.gerant_expense.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/gerant/expenses'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/expense/expense').listExpensesValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gerant/expense_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gerant/expense_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'gerant.expenses.gerant_expense.summary': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/gerant/expenses/summary'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/expense/expense').listExpensesValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gerant/expense_controller').default['summary']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gerant/expense_controller').default['summary']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'gerant.expenses.gerant_expense.store': {
    methods: ["POST"]
    pattern: '/api/v1/gerant/expenses'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/expense/expense').createExpenseValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/expense/expense').createExpenseValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gerant/expense_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gerant/expense_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'gerant.expenses.gerant_expense.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/gerant/expenses/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/expense/expense').updateExpenseValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/expense/expense').updateExpenseValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gerant/expense_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gerant/expense_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'gerant.expenses.gerant_expense.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/gerant/expenses/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gerant/expense_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gerant/expense_controller').default['destroy']>>>
    }
  }
  'gerant.finance.gerant_finance.overview': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/gerant/finance/overview'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/finance/finance').financeOverviewValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gerant/finance_controller').default['overview']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gerant/finance_controller').default['overview']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'gerant.profile.gerant_profile.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/gerant/profile'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gerant/profile_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gerant/profile_controller').default['show']>>>
    }
  }
  'gerant.profile.gerant_profile.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/gerant/profile'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/manager/manager').updateManagerProfileValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/manager/manager').updateManagerProfileValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gerant/profile_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gerant/profile_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
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
  'client.properties.client_property.availability': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/client/properties/:id/availability'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/client/property_controller').default['availability']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/client/property_controller').default['availability']>>>
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
  'client.client_booking.store': {
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
  'client.client_negotiation.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/client/properties/:property_id/negotiation'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { property_id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/client/negotiation_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/client/negotiation_controller').default['show']>>>
    }
  }
  'client.client_negotiation.next': {
    methods: ["POST"]
    pattern: '/api/v1/client/properties/:property_id/negotiation/next'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { property_id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/client/negotiation_controller').default['next']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/client/negotiation_controller').default['next']>>>
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
  'client.bookings.client_booking.apply_sponsorship_credit': {
    methods: ["POST"]
    pattern: '/api/v1/client/bookings/:id/sponsorship-credit'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/client/booking_controller').default['applySponsorshipCredit']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/client/booking_controller').default['applySponsorshipCredit']>>>
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
  'client.bookings.client_booking_payment.confirm_wave': {
    methods: ["POST"]
    pattern: '/api/v1/client/bookings/:id/payments/wave/confirm'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/client/booking_payment_controller').default['confirmWave']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/client/booking_payment_controller').default['confirmWave']>>>
    }
  }
  'sponsorship.sponsorship.check_code': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/sponsorship/codes/:code'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { code: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/sponsorship_controller').default['checkCode']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/sponsorship_controller').default['checkCode']>>>
    }
  }
  'sponsorship.sponsorship.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/sponsorship'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/sponsorship_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/sponsorship_controller').default['show']>>>
    }
  }
  'sponsorship.sponsorship.apply': {
    methods: ["POST"]
    pattern: '/api/v1/sponsorship/apply'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/sponsorship/sponsorship').applySponsorshipCodeValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/sponsorship/sponsorship').applySponsorshipCodeValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/sponsorship_controller').default['apply']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/sponsorship_controller').default['apply']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'sponsorship.sponsorship.sponsored': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/sponsorship/sponsored'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/sponsorship_controller').default['sponsored']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/sponsorship_controller').default['sponsored']>>>
    }
  }
  'sponsorship.sponsorship.transactions': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/sponsorship/transactions'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/sponsorship/sponsorship').listSponsorshipTransactionsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/sponsorship_controller').default['transactions']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/sponsorship_controller').default['transactions']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'sponsorship.sponsorship.redemptions': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/sponsorship/redemptions'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/sponsorship/sponsorship').listRedemptionsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/sponsorship_controller').default['redemptions']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/sponsorship_controller').default['redemptions']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'sponsorship.sponsorship.request_redemption': {
    methods: ["POST"]
    pattern: '/api/v1/sponsorship/redemptions'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/sponsorship/sponsorship').requestRedemptionValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/sponsorship/sponsorship').requestRedemptionValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/sponsorship_controller').default['requestRedemption']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/sponsorship_controller').default['requestRedemption']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'wave_webhook': {
    methods: ["POST"]
    pattern: '/api/v1/payments/wave/webhook'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/wave_webhook_controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/wave_webhook_controller').default['handle']>>>
    }
  }
  'booking_wave_return': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/payments/wave/bookings/:booking_id/return'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { booking_id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/client/booking_payment_controller').default['waveReturn']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/client/booking_payment_controller').default['waveReturn']>>>
    }
  }
  'subscription_wave_webhook': {
    methods: ["POST"]
    pattern: '/api/v1/payments/wave/subscriptions/webhook'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/wave_webhook_controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/wave_webhook_controller').default['handle']>>>
    }
  }
  'subscription_wave_return': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/payments/wave/subscriptions/:reference/return'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { reference: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/proprio/subscription_payment_controller').default['waveReturn']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/proprio/subscription_payment_controller').default['waveReturn']>>>
    }
  }
  'wave_test_return': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/payments/wave/test/return'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/wave_test_controller').default['waveReturn']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/wave_test_controller').default['waveReturn']>>>
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
  'cron.cron.subscription_reminders': {
    methods: ["GET","POST"]
    pattern: '/api/v1/cron/subscription-reminders'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/cron_controller').default['subscriptionReminders']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/cron_controller').default['subscriptionReminders']>>>
    }
  }
  'cron.cron.stay_statuses': {
    methods: ["GET","POST"]
    pattern: '/api/v1/cron/stay-statuses'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/cron_controller').default['stayStatuses']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/cron_controller').default['stayStatuses']>>>
    }
  }
  'cron.cron.sponsorship_rewards': {
    methods: ["GET","POST"]
    pattern: '/api/v1/cron/sponsorship-rewards'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/cron_controller').default['sponsorshipRewards']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/cron_controller').default['sponsorshipRewards']>>>
    }
  }
  'cron.cron.purge_sessions': {
    methods: ["GET","POST"]
    pattern: '/api/v1/cron/purge-sessions'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/cron_controller').default['purgeSessions']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/cron_controller').default['purgeSessions']>>>
    }
  }
  'cron.cron.purge_audit_logs': {
    methods: ["GET","POST"]
    pattern: '/api/v1/cron/purge-audit-logs'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/cron_controller').default['purgeAuditLogs']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/cron_controller').default['purgeAuditLogs']>>>
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
