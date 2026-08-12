// How long a signed-in session may run without ever reaching the server.
//
// The offline cache is the point of the PWA, but it is also a copy of the gym's
// members and takings sitting on a machine that no longer has to prove anything
// to anyone. A laptop that walks out of the gym and is never allowed near the
// internet again would otherwise keep answering from that copy forever. So the
// session gets a leash: two days of no contact with the server and the desk is
// signed out and the cache is dropped, the same as pressing Sign out.
//
// Two days is deliberately far shorter than the tokens themselves (access 7 days,
// refresh 30 — see backend/config/settings.py). The tokens decide how long the
// server will keep trusting this device; this decides how long the device may go
// on trusting itself.

const KEY = 'last_server_contact'

export const OFFLINE_GRACE_MS = 2 * 24 * 60 * 60 * 1000

/**
 * Record that the server actually answered.
 *
 * Called from the axios interceptor on any real reply — including a 4xx, which
 * had to reach the server to exist. Deliberately NOT called from the browser's
 * `online` event: that fires when a network appears, which is not the same as
 * the server being reachable, and treating it as contact would hand a stolen
 * laptop a fresh two days for joining any café's wifi.
 */
export function markServerSeen() {
  try {
    localStorage.setItem(KEY, String(Date.now()))
  } catch { /* private mode with no storage — the watchdog just can't run */ }
}

/** Start the clock. Called on sign-in, so a fresh session begins with a full leash. */
export function startOfflineClock() {
  markServerSeen()
}

export function clearOfflineClock() {
  try { localStorage.removeItem(KEY) } catch { /* nothing to clear */ }
}

/**
 * Give a session that has no usable stamp one as of now.
 *
 * Two cases land here, and both want the same answer. A session that predates
 * this feature has never been stamped; and a clock that has moved backwards (a
 * manual change, or a machine booting with a bad RTC before NTP corrects it)
 * leaves a stamp in the future. Treating either as "ancient" would sign the desk
 * out for something it did not do — and a spurious sign-out mid-shift is by far
 * the more expensive mistake here.
 *
 * Called once, when the watchdog mounts. Everything else only reads.
 */
export function ensureOfflineClock() {
  if (msSinceServerSeen() === null) markServerSeen()
}

/**
 * Milliseconds since the server last answered, or null when that is unknowable —
 * no stamp, unreadable storage, or a stamp in the future. A pure read: safe to
 * call while rendering.
 */
export function msSinceServerSeen() {
  let raw
  try { raw = localStorage.getItem(KEY) } catch { return null }
  if (!raw) return null

  const seen = Number(raw)
  if (!Number.isFinite(seen)) return null

  const elapsed = Date.now() - seen
  return elapsed < 0 ? null : elapsed
}

/** Time left before the session is dropped, in ms. Null when unknowable. */
export function msLeftOffline() {
  const since = msSinceServerSeen()
  if (since === null) return null
  return Math.max(OFFLINE_GRACE_MS - since, 0)
}

/** True once the leash has run out. Unknowable never counts as expired. */
export function offlineSessionExpired() {
  const since = msSinceServerSeen()
  return since !== null && since >= OFFLINE_GRACE_MS
}

/** "1 day 8 hours" / "3 hours" / "12 minutes" — for telling the desk what is left. */
export function formatDuration(ms) {
  const mins = Math.floor(ms / 60000)
  const days = Math.floor(mins / 1440)
  const hours = Math.floor((mins % 1440) / 60)
  const minutes = mins % 60

  const part = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
  if (days > 0) return hours > 0 ? `${part(days, 'day')} ${part(hours, 'hour')}` : part(days, 'day')
  if (hours > 0) return minutes > 0 ? `${part(hours, 'hour')} ${part(minutes, 'minute')}` : part(hours, 'hour')
  return part(Math.max(minutes, 1), 'minute')
}
