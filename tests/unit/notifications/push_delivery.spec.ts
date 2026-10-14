import { test } from '@japa/runner'

import { deliverPush, type PushTransport } from '#features/notifications/push_delivery'

/** Transport factice : rejette les jetons listés, note les lots reçus. */
function fakeTransport(rejected: Record<string, string> = {}) {
  const batches: string[][] = []
  const transport: PushTransport = {
    async sendMulticast(tokens) {
      batches.push(tokens)
      return tokens.map((token) =>
        rejected[token] ? { ok: false, errorCode: rejected[token] } : { ok: true }
      )
    },
  }
  return { transport, batches }
}

const message = { title: 'Titre', body: 'Corps' }

test.group('deliverPush', () => {
  test('compte les envois réussis', async ({ assert }) => {
    const { transport } = fakeTransport()
    const result = await deliverPush(
      [
        { id: 'd1', token: 't1' },
        { id: 'd2', token: 't2' },
      ],
      message,
      transport
    )
    assert.deepEqual(result, { sent: 2, failed: 0, invalid_ids: [] })
  })

  test('désigne les jetons morts pour suppression', async ({ assert }) => {
    // Une application désinstallée laisse un jeton que FCM refuse à jamais :
    // le garder ferait échouer chaque envoi suivant.
    const { transport } = fakeTransport({
      t1: 'messaging/registration-token-not-registered',
      t2: 'messaging/internal-error',
    })
    const result = await deliverPush(
      [
        { id: 'd1', token: 't1' },
        { id: 'd2', token: 't2' },
      ],
      message,
      transport
    )
    assert.equal(result.failed, 2)
    // Une panne passagère ne condamne pas le jeton.
    assert.deepEqual(result.invalid_ids, ['d1'])
  })

  test('découpe en lots de la taille admise par FCM', async ({ assert }) => {
    const { transport, batches } = fakeTransport()
    const targets = Array.from({ length: 5 }, (_, i) => ({ id: `d${i}`, token: `t${i}` }))
    await deliverPush(targets, message, transport, 2)
    assert.deepEqual(
      batches.map((b) => b.length),
      [2, 2, 1]
    )
  })

  test('un même jeton n’est envoyé qu’une fois', async ({ assert }) => {
    const { transport, batches } = fakeTransport()
    await deliverPush(
      [
        { id: 'd1', token: 't1' },
        { id: 'd1', token: 't1' },
      ],
      message,
      transport
    )
    assert.deepEqual(batches, [['t1']])
  })

  test('aucune cible : aucun appel', async ({ assert }) => {
    const { transport, batches } = fakeTransport()
    const result = await deliverPush([], message, transport)
    assert.lengthOf(batches, 0)
    assert.deepEqual(result, { sent: 0, failed: 0, invalid_ids: [] })
  })
})
