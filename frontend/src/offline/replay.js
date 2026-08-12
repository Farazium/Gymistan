// Sending the queue to the server once there is a server to send it to.
//
// Three things decide the shape of this file:
//
// 1. The token is refreshed FIRST. A desk that has been offline for a day comes
//    back with an access token that may well have aged out. Replay without
//    refreshing and every queued write 401s at once — and to the person at the
//    desk that looks exactly like the day's takings having been lost.
//
// 2. Order is preserved and one request is in flight at a time. The desk entered
//    these in an order that meant something (a member, then their joining
//    payment), and `apply_payment` does arithmetic against the member's current
//    state — running them in parallel would apply them in whatever order the
//    network happened to deliver.
//
// 3. A rejection is not a retry. If the server says 400 or 409, sending it again
//    produces the same answer; the write is parked as failed for a human to look
//    at, and the queue moves on. Only silence — no response at all — stops the
//    run, because that means the line went down again mid-flight.

import axios from 'axios'
import api from '../api/axios'
import { PENDING, FAILED, pendingFor, update, remove, subscribe } from './queue'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

// Only one replay at a time, however many things ask for one — a reconnect
// event, a manual retry and a tab regaining focus can easily arrive together.
let running = null

/**
 * Get a fresh access token before anything is replayed.
 *
 * Deliberately uses bare axios: the shared instance's 401 handler would try to
 * refresh the refresh call, and a failure here must not clear the session — the
 * queue is still holding the desk's work.
 */
async function refreshToken() {
  const refresh = localStorage.getItem('refresh_token')
  if (!refresh) return false
  try {
    const { data } = await axios.post(`${API_BASE}/auth/refresh/`, { refresh })
    localStorage.setItem('access_token', data.access)
    return true
  } catch {
    // Both failures mean the same thing here: don't replay yet. No response and
    // the line is not really back; a refusal and the session is over. Either
    // way the queue stays put rather than being thrown at the server under a
    // token that cannot work.
    return false
  }
}

function isValidationFailure(status) {
  // 4xx that will say the same thing next time. 408 and 429 are the exceptions:
  // both are explicitly "ask again later".
  return status >= 400 && status < 500 && status !== 408 && status !== 429
}

function messageFor(error) {
  const data = error?.response?.data
  if (!data) return 'No response from the server'
  if (typeof data === 'string') return data.slice(0, 300)
  if (data.detail) return String(data.detail)
  if (data.message) return String(data.message)
  const first = Object.entries(data).find(([, v]) => v != null && (!Array.isArray(v) || v.length))
  if (first) {
    const [field, value] = first
    return `${field}: ${Array.isArray(value) ? value[0] : value}`
  }
  return 'Rejected by the server'
}

/**
 * Send everything queued for this user.
 *
 * Returns a summary the caller can put in front of the desk: how many landed,
 * how many were rejected, and whether the run was cut short by the line going
 * down again.
 */
export function replayQueue(userId) {
  if (running) return running

  running = (async () => {
    const summary = { sent: 0, failed: 0, interrupted: false }

    const queued = await pendingFor(userId)
    if (!queued.length) return summary

    if (!(await refreshToken())) {
      // Either there is no session to replay under, or the server is not
      // reachable after all. Nothing is marked failed — this is not the queue's
      // fault and the work is still good.
      summary.interrupted = true
      return summary
    }

    for (const entry of queued) {
      try {
        await api.request({
          method: entry.method,
          url: entry.url,
          data: entry.data,
          // The same key the first attempt carried. This is the line that stops
          // a write which already landed from landing again.
          headers: { 'Idempotency-Key': entry.key },
          // Never let a replay be re-queued by the interceptor: it is already on
          // the queue, and enqueuing it again would duplicate the record.
          __isReplay: true,
        })
        await remove(entry.id)
        summary.sent += 1
      } catch (error) {
        if (!error.response) {
          // The line dropped mid-run. Leave this one and everything after it
          // pending, exactly where they were.
          summary.interrupted = true
          break
        }
        if (isValidationFailure(error.response.status)) {
          await update(entry.id, {
            status: FAILED,
            error: messageFor(error),
            attempts: (entry.attempts || 0) + 1,
          })
          summary.failed += 1
          continue
        }
        // 5xx, 408, 429 — worth another go later. Count the attempt and stop, so
        // a struggling server isn't handed the whole queue at once.
        await update(entry.id, {
          status: PENDING,
          error: messageFor(error),
          attempts: (entry.attempts || 0) + 1,
        })
        summary.interrupted = true
        break
      }
    }

    return summary
  })()

  running.finally(() => { running = null })
  return running
}

export { subscribe }
