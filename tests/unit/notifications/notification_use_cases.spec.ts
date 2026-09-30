import { test } from '@japa/runner'

import SendAdminNotificationUseCase from '#features/notifications/use_cases/send_admin_notification.use_case'
import SendSubscriptionRemindersUseCase from '#features/notifications/use_cases/send_subscription_reminders.use_case'
import { DomainError } from '#utils/domain_error'

import type { PushTransport } from '#features/notifications/push_delivery'
import type NotificationRepository from '#features/notifications/repositories/notification_repository'

const now = new Date('2026-09-30T08:00:00Z')

/** Dépôt en mémoire : mêmes méthodes, aucune écriture Firestore. */
function fakeRepo(options: {
  subscriptions?: Array<{ _id: string; user_id: string; is_trial: boolean; end_date: Date }>
  devices?: Array<{ id: string; token: string; user_id: string; role: string }>
  claimed?: string[]
}) {
  const claimed = new Set(options.claimed ?? [])
  const devices = options.devices ?? []
  const state = { removed: [] as string[], campaigns: [] as any[], claims: [] as string[] }

  const repo = {
    async subscriptionsEndingBetween() {
      return options.subscriptions ?? []
    },
    async claimDispatch(id: string) {
      if (claimed.has(id)) return false
      claimed.add(id)
      state.claims.push(id)
      return true
    },
    async targetsForUsers(ids: readonly string[]) {
      return devices.filter((d) => ids.includes(d.user_id))
    },
    async targetsForRole(role: string) {
      return devices.filter((d) => d.role === role)
    },
    async removeDevices(ids: readonly string[]) {
      state.removed.push(...ids)
    },
    async recordCampaign(input: any) {
      state.campaigns.push(input)
      return { id: 'c1', ...input }
    },
  }

  return { repo: repo as unknown as NotificationRepository, state }
}

function transport(rejected: Record<string, string> = {}) {
  const sent: Array<{ tokens: string[]; title: string }> = []
  const t: PushTransport = {
    async sendMulticast(tokens, message) {
      sent.push({ tokens, title: message.title })
      return tokens.map((token) =>
        rejected[token] ? { ok: false, errorCode: rejected[token] } : { ok: true }
      )
    },
  }
  return { transport: t, sent }
}

test.group('SendSubscriptionRemindersUseCase', () => {
  test('relance le propriétaire à l’étape due, une seule fois', async ({ assert }) => {
    const { repo, state } = fakeRepo({
      subscriptions: [
        { _id: 's1', user_id: 'o1', is_trial: false, end_date: new Date('2026-10-03T12:00:00Z') },
      ],
      devices: [{ id: 'd1', token: 't1', user_id: 'o1', role: 'proprio' }],
    })
    const { transport: t, sent } = transport()
    const useCase = new SendSubscriptionRemindersUseCase(repo, t)

    const first = await useCase.execute(now)
    const second = await useCase.execute(now)

    assert.equal(first.reminders_sent, 1)
    assert.equal(first.devices_sent, 1)
    assert.deepEqual(state.claims, ['s1:j3:2026-10-03'])
    assert.equal(sent[0].title, 'Votre abonnement expire dans 3 jours')
    // L'ordonnanceur rappelle la route : rien ne repart.
    assert.equal(second.reminders_sent, 0)
    assert.equal(second.already_sent, 1)
  })

  test('ignore une échéance hors étape', async ({ assert }) => {
    const { repo } = fakeRepo({
      subscriptions: [
        { _id: 's1', user_id: 'o1', is_trial: false, end_date: new Date('2026-10-20T12:00:00Z') },
      ],
    })
    const { transport: t, sent } = transport()
    const result = await new SendSubscriptionRemindersUseCase(repo, t).execute(now)
    assert.equal(result.reminders_sent, 0)
    assert.lengthOf(sent, 0)
  })

  test('purge les appareils au jeton mort', async ({ assert }) => {
    const { repo, state } = fakeRepo({
      subscriptions: [
        { _id: 's1', user_id: 'o1', is_trial: true, end_date: new Date('2026-09-30T20:00:00Z') },
      ],
      devices: [{ id: 'd1', token: 't1', user_id: 'o1', role: 'proprio' }],
    })
    const { transport: t } = transport({ t1: 'messaging/registration-token-not-registered' })
    await new SendSubscriptionRemindersUseCase(repo, t).execute(now)
    assert.deepEqual(state.removed, ['d1'])
  })
})

test.group('SendAdminNotificationUseCase', () => {
  const devices = [
    { id: 'd1', token: 't1', user_id: 'o1', role: 'proprio' },
    { id: 'd2', token: 't2', user_id: 'o1', role: 'proprio' },
    { id: 'd3', token: 't3', user_id: 'o2', role: 'proprio' },
    { id: 'd4', token: 't4', user_id: 'c1', role: 'client' },
  ]

  test('groupée : tous les propriétaires, jamais les clients', async ({ assert }) => {
    const { repo, state } = fakeRepo({ devices })
    const { transport: t, sent } = transport()
    const campaign = await new SendAdminNotificationUseCase(repo, t).execute({
      title: 'Maintenance',
      body: 'Ce soir à 22 h',
      audience: 'all_owners',
      created_by: 'admin-1',
    })

    assert.sameMembers(sent[0].tokens, ['t1', 't2', 't3'])
    assert.equal(campaign.recipients_count, 2)
    assert.equal(campaign.devices_sent, 3)
    assert.deepEqual(state.campaigns[0].owner_ids, [])
  })

  test('ciblée : les seuls propriétaires choisis', async ({ assert }) => {
    const { repo } = fakeRepo({ devices })
    const { transport: t, sent } = transport()
    const campaign = await new SendAdminNotificationUseCase(repo, t).execute({
      title: 'Votre dossier',
      body: 'Pièce illisible',
      audience: 'selected_owners',
      owner_ids: ['o2'],
      created_by: 'admin-1',
    })

    assert.deepEqual(sent[0].tokens, ['t3'])
    assert.equal(campaign.recipients_count, 1)
  })

  test('ciblée : un compte client glissé dans la sélection ne reçoit rien', async ({ assert }) => {
    const { repo } = fakeRepo({ devices })
    const { transport: t, sent } = transport()
    await new SendAdminNotificationUseCase(repo, t).execute({
      title: 'X',
      body: 'Y',
      audience: 'selected_owners',
      owner_ids: ['o2', 'c1'],
      created_by: 'admin-1',
    })
    assert.deepEqual(sent[0].tokens, ['t3'])
  })

  test('ciblée sans propriétaire : refusée', async ({ assert }) => {
    const { repo } = fakeRepo({ devices })
    const { transport: t } = transport()
    try {
      await new SendAdminNotificationUseCase(repo, t).execute({
        title: 'X',
        body: 'Y',
        audience: 'selected_owners',
        owner_ids: [],
        created_by: 'admin-1',
      })
      assert.fail('aurait dû être refusée')
    } catch (error) {
      assert.instanceOf(error, DomainError)
      assert.equal((error as DomainError).code, 'notification_no_recipient')
    }
  })

  test('aucun appareil joignable : la campagne est tracée, rien n’est envoyé', async ({
    assert,
  }) => {
    const { repo, state } = fakeRepo({ devices: [] })
    const { transport: t, sent } = transport()
    const campaign = await new SendAdminNotificationUseCase(repo, t).execute({
      title: 'X',
      body: 'Y',
      audience: 'all_owners',
      created_by: 'admin-1',
    })
    assert.lengthOf(sent, 0)
    assert.equal(campaign.devices_sent, 0)
    assert.lengthOf(state.campaigns, 1)
  })
})
