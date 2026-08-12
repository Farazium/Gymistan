// A cached read must never be mistaken for a connection.
//
// The service worker answers GETs from its cache with status 200, which from
// here is indistinguishable from the server replying. Believing it produced two
// failures in one: the app announced "Back online" to a machine with no
// internet at all, and the offline session leash was reset from our own cache on
// every page view, so a device that never reached a server again would never
// have been signed out.
//
// These tests pin what may and may not count as contact.

import { describe, it, expect, beforeEach, vi } from 'vitest'

let api, useNetStore, offlineSession

const DAY = 24 * 60 * 60 * 1000

function reply(config, { status = 200, data = {} } = {}) {
  return Promise.resolve({ data, status, statusText: '', headers: {}, config, request: {} })
}

function rejection(config, status) {
  const error = new Error(`status ${status}`)
  error.config = config
  error.request = {}
  error.response = { status, data: {}, statusText: '', headers: {}, config }
  return Promise.reject(error)
}

beforeEach(async () => {
  vi.resetModules()
  localStorage.clear()

  api = (await import('./axios')).default
  useNetStore = (await import('../store/netStore')).default
  offlineSession = await import('../utils/offlineSession')

  // Start from "the line is down", which is where a cached read would wrongly
  // rescue us.
  useNetStore.getState().markOffline()
  // ...and from a leash that is one minute from running out, so any stamp shows.
  localStorage.setItem(
    'last_server_contact',
    String(Date.now() - (offlineSession.OFFLINE_GRACE_MS - 60_000))
  )
})

const nearlyExpired = () => offlineSession.msLeftOffline() < 2 * 60_000

describe('what does not prove a connection', () => {
  it('a 200 on a GET — it may have come from the service worker cache', async () => {
    api.defaults.adapter = (config) => reply(config)

    await api.get('/members/')

    expect(useNetStore.getState().online).toBe(false)
    expect(nearlyExpired()).toBe(true)
  })

  it('so the "back online" bar is not triggered by cached reads', async () => {
    api.defaults.adapter = (config) => reply(config)

    await api.get('/payments/')
    await api.get('/expenses/')

    expect(useNetStore.getState().reconnectedAt).toBeNull()
  })

  it('and a whole offline session of reads never resets the leash', async () => {
    // The dangerous one: a laptop out of the building, answering itself.
    localStorage.setItem('last_server_contact', String(Date.now() - 3 * DAY))
    api.defaults.adapter = (config) => reply(config)

    for (let i = 0; i < 5; i++) await api.get('/members/')

    expect(offlineSession.offlineSessionExpired()).toBe(true)
  })
})

describe('what does prove a connection', () => {
  it('a write — nothing but GETs is ever cached', async () => {
    api.defaults.adapter = (config) => reply(config, { status: 201 })

    await api.post('/payments/', { amount: '1' })

    expect(useNetStore.getState().online).toBe(true)
    expect(nearlyExpired()).toBe(false)
  })

  it('any status other than 200 — only 200s are stored', async () => {
    api.defaults.adapter = (config) => rejection(config, 500)

    await expect(api.get('/members/')).rejects.toThrow()

    expect(useNetStore.getState().online).toBe(true)
    expect(nearlyExpired()).toBe(false)
  })

  it('a __probe request — the cache route skips it by name', async () => {
    api.defaults.adapter = (config) => reply(config)

    await api.get('/auth/me/', { params: { __probe: 1 } })

    expect(useNetStore.getState().online).toBe(true)
    expect(nearlyExpired()).toBe(false)
  })
})

describe('the probe helper', () => {
  it('reports the server as there when it answers', async () => {
    api.defaults.adapter = (config) => reply(config)
    const { probeServer } = await import('../utils/probe')

    await expect(probeServer()).resolves.toBe(true)
    expect(useNetStore.getState().online).toBe(true)
  })

  it('counts a refusal as contact — it had to come from somewhere', async () => {
    api.defaults.adapter = (config) => rejection(config, 401)
    const { probeServer } = await import('../utils/probe')

    await expect(probeServer()).resolves.toBe(true)
    expect(useNetStore.getState().online).toBe(true)
  })

  it('reports silence as offline', async () => {
    api.defaults.adapter = (config) => {
      const error = new Error('Network Error')
      error.code = 'ERR_NETWORK'
      error.config = config
      error.request = {}
      return Promise.reject(error)
    }
    const { probeServer } = await import('../utils/probe')

    await expect(probeServer()).resolves.toBe(false)
    expect(useNetStore.getState().online).toBe(false)
    // And the leash keeps running, which is the whole point.
    expect(nearlyExpired()).toBe(true)
  })

  it('is never queued as an offline write', async () => {
    // It is a GET, so it cannot be — but if it ever became one, a probe sitting
    // in the queue would be replayed as though it were the desk's work.
    const { isQueueable } = await import('../offline/queueable')
    expect(isQueueable({ method: 'get', url: '/auth/me/' })).toBe(false)
  })
})
