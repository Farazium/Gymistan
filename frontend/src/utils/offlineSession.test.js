// The leash: how long a signed-in session may run without ever reaching the
// server. The interesting cases are all at the edges — a session that has never
// been stamped, and a clock that has moved.

import { describe, it, expect, beforeEach } from 'vitest'
import {
  OFFLINE_GRACE_MS, markServerSeen, startOfflineClock, clearOfflineClock,
  ensureOfflineClock, msSinceServerSeen, msLeftOffline, offlineSessionExpired,
  formatDuration,
} from './offlineSession'

const KEY = 'last_server_contact'
const DAY = 24 * 60 * 60 * 1000

const stampAgo = (ms) => localStorage.setItem(KEY, String(Date.now() - ms))

beforeEach(() => localStorage.clear())

describe('a session with no stamp', () => {
  it('is unknowable rather than ancient', () => {
    expect(msSinceServerSeen()).toBeNull()
    expect(msLeftOffline()).toBeNull()
  })

  it('is never treated as expired', () => {
    // Shipping this feature must not sign out every desk that happens to be
    // mid-outage on the day it deploys.
    expect(offlineSessionExpired()).toBe(false)
  })

  it('is adopted with a full leash', () => {
    ensureOfflineClock()
    expect(offlineSessionExpired()).toBe(false)
    expect(Math.round(msLeftOffline() / DAY)).toBe(2)
  })
})

describe('the leash itself', () => {
  it('holds right up to the limit', () => {
    stampAgo(OFFLINE_GRACE_MS - 60_000)
    expect(offlineSessionExpired()).toBe(false)
    expect(formatDuration(msLeftOffline())).toBe('1 minute')
  })

  it('runs out exactly at the limit', () => {
    stampAgo(OFFLINE_GRACE_MS)
    expect(offlineSessionExpired()).toBe(true)
    expect(msLeftOffline()).toBe(0)
  })

  it('stays out well past it', () => {
    stampAgo(9 * DAY)
    expect(offlineSessionExpired()).toBe(true)
  })

  it('is reset by any reply from the server', () => {
    stampAgo(9 * DAY)
    markServerSeen()
    expect(offlineSessionExpired()).toBe(false)
  })

  it('starts fresh on sign-in and is cleared on sign-out', () => {
    startOfflineClock()
    expect(offlineSessionExpired()).toBe(false)

    clearOfflineClock()
    expect(msSinceServerSeen()).toBeNull()
  })
})

describe('a clock that cannot be trusted', () => {
  it('reads a stamp from the future as unknowable, not as expired', () => {
    // A manual change, or a machine booting with a bad RTC before NTP corrects
    // it. A spurious sign-out mid-shift is the more expensive mistake.
    localStorage.setItem(KEY, String(Date.now() + 5 * DAY))
    expect(msSinceServerSeen()).toBeNull()
    expect(offlineSessionExpired()).toBe(false)
  })

  it('shrugs off a stamp that is not a number', () => {
    localStorage.setItem(KEY, 'not-a-number')
    expect(offlineSessionExpired()).toBe(false)
  })
})

describe('telling the desk how long is left', () => {
  it.each([
    [2 * DAY, '2 days'],
    [DAY + 8 * 3600_000, '1 day 8 hours'],
    [DAY, '1 day'],
    [3 * 3600_000, '3 hours'],
    [90 * 60_000, '1 hour 30 minutes'],
    [5 * 60_000, '5 minutes'],
    // Never "0 minutes" — the bar would read as though it had already happened.
    [0, '1 minute'],
  ])('%i ms reads as "%s"', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected)
  })
})
