/* Demo mode plumbing.

   The flag lives in sessionStorage, so a demo stays in its own tab and closing
   the tab ends it — nothing about a demo visit outlives the session. Entering and
   leaving both do a full page load: the axios adapter has to be swapped before
   any component mounts, and a reload is the one way to guarantee that ordering
   without threading a flag through every module. */
import { handle } from './api'

const KEY = 'gymistan_demo'

export const isDemo = () =>
  typeof window !== 'undefined' && sessionStorage.getItem(KEY) === '1'

export const markDemo = () => sessionStorage.setItem(KEY, '1')

/* Leaving drops only the tab's own demo state. A real session the same person
   has signed into (which lives in localStorage) is deliberately left alone. */
export function exitDemo() {
  sessionStorage.removeItem('auth-storage')
  sessionStorage.removeItem(KEY)
  window.location.replace('/')
}

/* A little latency, so the app's own loading states (skeletons, spinners,
   disabled buttons) are part of the tour rather than being skipped past. */
const latency = (method) => (method === 'get' ? 90 + Math.random() * 140 : 220 + Math.random() * 200)

function pathOf(config) {
  let url = config.url || ''
  const base = config.baseURL || ''
  if (base && url.startsWith(base)) url = url.slice(base.length)
  url = url.replace(/^https?:\/\/[^/]+/, '')
  url = url.replace(/^\/api(?=\/|$)/, '')
  const q = url.indexOf('?')
  if (q >= 0) url = url.slice(0, q)
  return url.startsWith('/') ? url : `/${url}`
}

function bodyOf(config) {
  const d = config.data
  if (d == null) return null
  if (typeof d === 'string') {
    try { return JSON.parse(d) } catch { return d }
  }
  return d   // FormData, or a plain object when transformRequest was bypassed
}

/* An axios adapter that answers from demo/api.js instead of the network. */
export async function demoAdapter(config) {
  const method = (config.method || 'get').toLowerCase()
  const path = pathOf(config)
  const params = { ...(config.params || {}) }
  const body = bodyOf(config)

  await new Promise((r) => setTimeout(r, latency(method)))

  const respond = (data, status = 200) => ({
    data,
    status,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    config,
    request: {},
  })

  try {
    const result = await handle({ method, path, params, body })
    if (result === null) return respond(null, 204)
    return respond(result, method === 'post' ? 201 : 200)
  } catch (err) {
    // Re-shape into something axios interceptors and the app's error helpers
    // recognise: a rejected promise carrying err.response.
    err.config = config
    err.response = { ...(err.response || { status: 500, data: { detail: 'Demo error' } }), config }
    throw err
  }
}
