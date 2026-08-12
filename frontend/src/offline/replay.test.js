// The two halves of the round trip: a write that fails offline must land on the
// queue under the key it already carried, and the queue must go back up in
// order, under that same key, once there is a server again.

import { describe, it, expect, beforeEach, vi } from 'vitest'

let api, queue, replay

/** An adapter failure with no response — what a dead line actually looks like. */
function networkFailure(config) {
  const error = new Error('Network Error')
  error.code = 'ERR_NETWORK'
  error.config = config
  error.request = {}
  return Promise.reject(error)
}

function reply(config, { status = 200, data = {} } = {}) {
  return Promise.resolve({ data, status, statusText: 'OK', headers: {}, config, request: {} })
}

function rejection(config, status, data = {}) {
  const error = new Error(`Request failed with status ${status}`)
  error.config = config
  error.request = {}
  error.response = { status, data, statusText: '', headers: {}, config }
  return Promise.reject(error)
}

beforeEach(async () => {
  vi.resetModules()
  localStorage.clear()
  localStorage.setItem('access_token', 'access-token')
  localStorage.setItem('refresh_token', 'refresh-token')

  api = (await import('../api/axios')).default
  queue = await import('./queue')
  replay = await import('./replay')
})

describe('a write that meets a dead line', () => {
  it('is queued and reported as accepted, not as an error', async () => {
    api.defaults.adapter = networkFailure

    const res = await api.post('/payments/', { amount: '3000', amount_paid: '3000' })

    // 202: taken, not yet acted on. The desk carries on.
    expect(res.status).toBe(202)
    expect(res.data.queued).toBe(true)

    const [entry] = await queue.pendingFor(null)
    expect(entry.url).toBe('/payments/')
    expect(entry.method).toBe('POST')
    expect(entry.data).toEqual({ amount: '3000', amount_paid: '3000' })
    expect(entry.label).toBe('Payment')
  })

  it('queues it under the very key the failed attempt carried', async () => {
    // If the request did reach the server, this is the key it was stamped with —
    // and re-sending under a different one would create a second payment.
    let sentKey
    api.defaults.adapter = (config) => {
      sentKey = config.headers['Idempotency-Key']
      return networkFailure(config)
    }

    await api.post('/payments/', { amount: '3000' })

    const [entry] = await queue.pendingFor(null)
    expect(sentKey).toBeTruthy()
    expect(entry.key).toBe(sentKey)
  })

  it('refuses to queue a WhatsApp send', async () => {
    // Sending is an external act against a live credit balance; replayed a day
    // later it messages a member about something long since dealt with.
    api.defaults.adapter = networkFailure

    await expect(api.post('/payments/12/whatsapp/')).rejects.toThrow()
    expect(await queue.entriesFor(null)).toHaveLength(0)
  })

  it('refuses to queue a delete', async () => {
    api.defaults.adapter = networkFailure

    await expect(api.delete('/payments/12/')).rejects.toThrow()
    expect(await queue.entriesFor(null)).toHaveLength(0)
  })

  it('lets a read fail as a read', async () => {
    api.defaults.adapter = networkFailure

    await expect(api.get('/payments/')).rejects.toThrow()
    expect(await queue.entriesFor(null)).toHaveLength(0)
  })
})

describe('replaying the queue', () => {
  async function seed(n) {
    for (let i = 0; i < n; i++) {
      await queue.enqueue({
        key: `key-${i}`, method: 'POST', url: '/payments/',
        data: { amount: String(i) }, label: 'Payment', userId: 1,
      })
    }
  }

  /** Adapter that answers the refresh call and hands writes to `onWrite`. */
  function adapter(onWrite) {
    return (config) => {
      if (String(config.url).includes('/auth/refresh/')) {
        return reply(config, { data: { access: 'fresh-token' } })
      }
      return onWrite(config)
    }
  }

  it('refreshes the token before sending anything', async () => {
    // Skip this and every queued write 401s at once, which at the desk looks
    // exactly like the day's takings having been lost.
    const order = []
    const run = adapter((config) => { order.push('write'); return reply(config, { status: 201 }) })
    api.defaults.adapter = (config) => {
      if (String(config.url).includes('/auth/refresh/')) order.push('refresh')
      return run(config)
    }
    const axiosDefault = (await import('axios')).default
    axiosDefault.defaults.adapter = api.defaults.adapter

    await seed(1)
    await replay.replayQueue(1)

    expect(order[0]).toBe('refresh')
    expect(localStorage.getItem('access_token')).toBe('fresh-token')
  })

  it('sends in order, under each write\'s own key, and clears them', async () => {
    const sent = []
    api.defaults.adapter = adapter((config) => {
      sent.push({ amount: JSON.parse(config.data).amount, key: config.headers['Idempotency-Key'] })
      return reply(config, { status: 201 })
    })
    const axiosDefault = (await import('axios')).default
    axiosDefault.defaults.adapter = api.defaults.adapter

    await seed(3)
    const summary = await replay.replayQueue(1)

    expect(summary).toEqual({ sent: 3, failed: 0, interrupted: false })
    expect(sent.map((s) => s.amount)).toEqual(['0', '1', '2'])
    expect(sent.map((s) => s.key)).toEqual(['key-0', 'key-1', 'key-2'])
    expect(await queue.entriesFor(1)).toHaveLength(0)
  })

  it('stops where the line dropped and keeps the rest pending', async () => {
    let n = 0
    api.defaults.adapter = adapter((config) => {
      n += 1
      return n === 2 ? networkFailure(config) : reply(config, { status: 201 })
    })
    const axiosDefault = (await import('axios')).default
    axiosDefault.defaults.adapter = api.defaults.adapter

    await seed(3)
    const summary = await replay.replayQueue(1)

    expect(summary.sent).toBe(1)
    expect(summary.interrupted).toBe(true)
    // The one that failed and the one behind it are untouched, still in order.
    const left = await queue.pendingFor(1)
    expect(left.map((e) => e.key)).toEqual(['key-1', 'key-2'])
  })

  it('parks a rejected write and carries on with the others', async () => {
    // A 400 says the same thing however many times it is sent, so it must not
    // block the payments queued behind it.
    let n = 0
    api.defaults.adapter = adapter((config) => {
      n += 1
      return n === 1
        ? rejection(config, 400, { amount: ['A valid number is required.'] })
        : reply(config, { status: 201 })
    })
    const axiosDefault = (await import('axios')).default
    axiosDefault.defaults.adapter = api.defaults.adapter

    await seed(3)
    const summary = await replay.replayQueue(1)

    expect(summary).toEqual({ sent: 2, failed: 1, interrupted: false })

    const failed = await queue.failedFor(1)
    expect(failed).toHaveLength(1)
    expect(failed[0].key).toBe('key-0')
    // The desk has to be able to read why, or the row is just a mystery.
    expect(failed[0].error).toContain('A valid number is required.')
  })

  it('keeps a 5xx pending rather than condemning it', async () => {
    api.defaults.adapter = adapter((config) => rejection(config, 500, { detail: 'Server error' }))
    const axiosDefault = (await import('axios')).default
    axiosDefault.defaults.adapter = api.defaults.adapter

    await seed(2)
    const summary = await replay.replayQueue(1)

    expect(summary.failed).toBe(0)
    expect(summary.interrupted).toBe(true)
    expect(await queue.pendingFor(1)).toHaveLength(2)
    // ...but the attempt is counted, so a write that keeps failing is visible.
    expect((await queue.pendingFor(1))[0].attempts).toBe(1)
  })

  it('does not replay when the refresh is refused', async () => {
    // The session is genuinely over. Throwing the queue at the server under a
    // dead token would only turn every entry into a failure.
    api.defaults.adapter = (config) => {
      if (String(config.url).includes('/auth/refresh/')) return rejection(config, 401)
      throw new Error('should not have sent a write')
    }
    const axiosDefault = (await import('axios')).default
    axiosDefault.defaults.adapter = api.defaults.adapter

    await seed(2)
    const summary = await replay.replayQueue(1)

    expect(summary).toEqual({ sent: 0, failed: 0, interrupted: true })
    expect(await queue.pendingFor(1)).toHaveLength(2)
  })

  it('runs once however many times it is asked', async () => {
    // A reconnect, a regained focus and a manual retry can easily land together.
    const sent = []
    api.defaults.adapter = adapter((config) => {
      sent.push(config.headers['Idempotency-Key'])
      return reply(config, { status: 201 })
    })
    const axiosDefault = (await import('axios')).default
    axiosDefault.defaults.adapter = api.defaults.adapter

    await seed(2)
    await Promise.all([replay.replayQueue(1), replay.replayQueue(1), replay.replayQueue(1)])

    expect(sent).toEqual(['key-0', 'key-1'])
  })
})
