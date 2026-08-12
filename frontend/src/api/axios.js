import axios from 'axios'
import { isDemo, demoAdapter } from '../demo'
import useNetStore from '../store/netStore'
import { markServerSeen } from '../utils/offlineSession'
import { isQueueable, describeWrite } from '../offline/queueable'
import { enqueue, newKey } from '../offline/queue'

// Base URL for the API, and the bare origin (no /api) for building media URLs
// like uploaded logos and background images.
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'
export const API_ORIGIN = API_BASE.replace(/\/api\/?$/, '')

const api = axios.create({
  baseURL: API_BASE,
})

// Public demo: answer every call from the in-browser sample gym instead of the
// network, so the tour is the real app running on static data. Swapped in here —
// at the single point every page already goes through — so no page needs to know.
if (isDemo()) api.defaults.adapter = demoAdapter

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`

  // Stamp every write that could ever be re-sent, online as much as offline.
  // The dangerous case is not the obvious one: it is the request that reaches
  // the server on a perfectly good connection and whose reply is lost on the way
  // back. The desk sees a failure, presses the button again, and the member is
  // charged twice. The key has to exist before the first attempt for the retry
  // to be recognisable as the same write — minting one at retry time would be
  // too late to be worth anything.
  if (isQueueable(config) && !config.headers['Idempotency-Key']) {
    config.headers['Idempotency-Key'] = config.__idempotencyKey || newKey()
  }
  // Kept on the config so the response interceptor can queue this exact write
  // under the exact key the server may already have seen.
  config.__idempotencyKey = config.headers['Idempotency-Key']

  return config
})

/**
 * Put a failed write on the queue and answer as if the server had taken it.
 *
 * The synthetic reply is a 202 — "accepted, not yet acted on" — which is
 * honestly what has happened. `queued: true` on the body is what lets a page
 * tell this apart from a real save when it matters: a queued payment has no id
 * yet, so nothing that needs one (sending the WhatsApp receipt, opening the
 * slip) may be attempted on the strength of it.
 *
 * Returns null if the queue itself is unavailable — a browser with no
 * IndexedDB, or storage the user has blocked. In that case the original error
 * is thrown as before, because telling the desk their payment is safe when
 * nothing stored it would be the worst outcome in this whole feature.
 */
async function queueWrite(config) {
  try {
    const raw = config.data
    // Axios has already serialised the body by the time an error comes back.
    const data = typeof raw === 'string' ? JSON.parse(raw) : (raw ?? null)

    const record = await enqueue({
      key: config.__idempotencyKey,
      method: config.method,
      url: config.url,
      data,
      label: describeWrite(config),
      userId: currentUserId(),
    })

    return {
      status: 202,
      statusText: 'Queued offline',
      headers: {},
      config,
      data: { queued: true, queuedId: record.id, queuedAt: record.createdAt },
    }
  } catch {
    return null
  }
}

/**
 * Could this reply only have come from the server?
 *
 * The service worker's read cache stores GET responses with status 200 and
 * nothing else, and never touches a request carrying `__probe`. So anything
 * outside that set reached the network to exist.
 */
function provesContact(config, status) {
  if (!config) return false
  if (String(config.method || 'get').toUpperCase() !== 'GET') return true
  if (status !== 200) return true
  return config.params ? '__probe' in config.params : false
}

/** The signed-in user's id, read straight from storage to avoid a store cycle. */
function currentUserId() {
  try {
    const raw = localStorage.getItem('auth-storage') || sessionStorage.getItem('auth-storage')
    return JSON.parse(raw)?.state?.user?.id ?? null
  } catch {
    return null
  }
}

api.interceptors.response.use(
  (res) => {
    // Careful: a 200 on a GET is NOT evidence of a connection. The service
    // worker answers reads from its cache with exactly that, so treating it as
    // contact makes the app announce "back online" to a machine with the cable
    // out, and — the part that actually matters — keeps resetting the offline
    // session leash from our own cache, so a device that never reaches a server
    // again is never signed out.
    //
    // What the cache cannot fake: a write (nothing but GETs is ever cached), a
    // status other than 200 (only 200s are stored), and a `__probe` request
    // (excluded from the cache route by name). Those are the replies that count.
    if (provesContact(res.config, res.status)) {
      useNetStore.getState().markOnline()
      markServerSeen()
    }
    return res
  },
  async (error) => {
    // No response at all is the shape a dead line takes: DNS failure, timeout,
    // the service worker finding nothing cached. A cancelled request is not an
    // outage — the user navigated away.
    if (!error.response && error.code !== 'ERR_CANCELED') {
      useNetStore.getState().markOffline()

      // The line is down and this is a write the desk is allowed to defer. Hold
      // it on the device and report it as accepted, so the accountant can carry
      // on taking money instead of standing still. A replay of the queue is
      // never re-queued here — it is already on the queue.
      const config = error.config
      if (config && !config.__isReplay && isQueueable(config)) {
        const queued = await queueWrite(config)
        if (queued) return queued
      }
    } else if (error.response) {
      // Only 200s are ever cached, so any error status came from the server.
      useNetStore.getState().markOnline()
      markServerSeen()
    }

    if (error.response?.status === 401) {
      const refresh = localStorage.getItem('refresh_token')
      if (refresh) {
        try {
          const { data } = await axios.post(
            `${import.meta.env.VITE_API_URL || 'http://localhost:8000/api'}/auth/refresh/`,
            { refresh }
          )
          localStorage.setItem('access_token', data.access)
          error.config.headers.Authorization = `Bearer ${data.access}`
          return api(error.config)
        } catch (refreshError) {
          // Only a refusal from the server means the session is really finished.
          // If the refresh call never got there, the session is fine and the line
          // is not — signing the desk out (and wiping the tokens they will need
          // when the net returns) would be the wrong end of the problem.
          if (!refreshError.response) {
            useNetStore.getState().markOffline()
            return Promise.reject(error)
          }
          localStorage.clear()
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(error)
  }
)

export default api
