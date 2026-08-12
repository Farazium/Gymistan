// The warmer's whole job is to fetch the *same* URLs the pages will later ask
// for. The cache is keyed on the full URL, so `/api/members/` and
// `/api/members/?page=1` are two different entries — warm the wrong one and the
// page still comes up empty offline, with nothing anywhere to say why.
//
// So these tests pin the exact request strings, and the ones for tier-gated
// endpoints check they are not asked for at all by a gym that cannot see them.

import { describe, it, expect, beforeEach, vi } from 'vitest'

let api, warmCache
let asked

beforeEach(async () => {
  vi.resetModules()
  localStorage.clear()
  asked = []

  api = (await import('../api/axios')).default
  warmCache = (await import('./warm')).warmCache

  api.defaults.adapter = (config) => {
    asked.push(wireForm(config))
    return Promise.resolve({
      data: [], status: 200, statusText: 'OK', headers: {}, config, request: {},
    })
  }
})

/**
 * What axios finally puts on the wire, params and all, with the API base
 * removed — the part that has to line up with the pages.
 */
function wireForm(config) {
  return api
    .getUri({ url: config.url, params: config.params })
    .replace(/^.*\/api(?=\/)/, '')
}

const deskUser = { id: 1, role: 'GYM_ADMIN', gym_tier: 'TIER1' }

describe('warming the read cache', () => {
  it('fetches the lists a desk needs, unfiltered', async () => {
    await warmCache(deskUser)

    // Unfiltered: exactly what a page requests before anyone touches a filter.
    expect(asked).toContain('/members/')
    expect(asked).toContain('/payments/')
    expect(asked).toContain('/expenses/')
    expect(asked).toContain('/inventory/')
    expect(asked).toContain('/dashboard/')
    // Forms cannot be filled offline without these, whatever page you are on.
    expect(asked).toContain('/packages/')
    expect(asked).toContain('/trainers/')
    expect(asked).toContain('/trainers/?is_active=true')
  })

  it('asks for no list with a query string it does not mean', async () => {
    await warmCache(deskUser)
    // `/members/?` or `/members/?page=1` would be cached under a URL no page
    // ever asks for, and the offline roster would be empty regardless.
    const stray = asked.filter((u) => u.startsWith('/members/') && u.includes('?'))
    expect(stray).toEqual([])
  })

  it('leaves out what a Starter gym cannot see', async () => {
    // Asking anyway means a 403 on every app open, on the gym's mobile data,
    // caching nothing.
    await warmCache(deskUser)
    expect(asked).not.toContain('/gyms/whatsapp-billing/')
    expect(asked.some((u) => u.startsWith('/attendance/'))).toBe(false)
  })

  it('includes the WhatsApp balance on a plan that has it', async () => {
    await warmCache({ ...deskUser, gym_tier: 'TIER2_WA' })
    expect(asked).toContain('/gyms/whatsapp-billing/')
  })

  it('includes today\'s attendance sheet on a plan that has it', async () => {
    await warmCache({ ...deskUser, gym_tier: 'TIER3' })

    const d = new Date()
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    // Character for character what the Attendance page opens with.
    expect(asked).toContain(`/attendance/?type=member&scope=daily&date=${today}`)
    expect(asked).toContain('/attendance/device/')
  })

  it('warms only the identity for a superadmin', async () => {
    // Their screens are about other people's gyms and are useless from a stale
    // copy — and the gym-scoped endpoints would 403 anyway.
    await warmCache({ id: 9, role: 'SUPERADMIN' })
    expect(asked).toEqual(['/auth/me/'])
  })

  it('carries on past an endpoint that fails', async () => {
    // Half a cache is what would have been there anyway; nothing here is worth
    // stopping for.
    api.defaults.adapter = (config) => {
      const uri = wireForm(config)
      asked.push(uri)
      if (uri === '/members/') {
        const error = new Error('boom')
        error.config = config
        error.response = { status: 500, data: {}, headers: {}, config }
        return Promise.reject(error)
      }
      return Promise.resolve({ data: [], status: 200, statusText: 'OK', headers: {}, config, request: {} })
    }

    const { warmed } = await warmCache(deskUser)

    expect(asked).toContain('/payments/')
    expect(warmed).toBeGreaterThan(0)
  })

  it('does not run twice at once', async () => {
    await Promise.all([warmCache(deskUser), warmCache(deskUser)])
    expect(asked.filter((u) => u === '/members/')).toHaveLength(1)
  })
})
