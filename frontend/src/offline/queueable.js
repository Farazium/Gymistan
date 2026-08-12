// Which writes may be held on the device until the line comes back.
//
// This is an allowlist, not a blocklist, and deliberately so. Queueing the wrong
// thing is worse than not queueing it: the desk is told their action was saved,
// and it either does something different by the time it lands or cannot be
// replayed at all. So a route earns its place here by being safe to apply late,
// and everything not named is simply refused offline.
//
// What is in, and why:
//
//   POST /payments/        the reason the queue exists — money taken at the desk
//   POST /expenses/        same shape: a fact about today that can land later
//   POST /members/         enrolling someone, including the joining payment
//   PATCH|PUT /members/:id editing a member's own details
//   POST /inventory/:id/adjust/  a supplement sold (or a stock correction) over
//     the counter. Safe to land late only because the desk is the single writer:
//     nobody else is moving this stock in the meantime. If the replayed quantity
//     no longer fits, the server rejects it and it lands in the failed list for a
//     human to look at, which is the right outcome.
//
// What is deliberately out:
//
//   Anything WhatsApp (/whatsapp/, /reminder/, /dues-reminder/) — sending is an
//     external act against a live credit balance. Held for a day and replayed, it
//     messages a member about something they have long since dealt with, and it
//     cannot be checked against credits while offline. The receipt is offered
//     again from the payments list once the desk is back on.
//   Every DELETE — deleting a payment rolls a member's expiry back to what that
//     payment found, and is only legal on their newest one within 24 hours. Both
//     of those are facts about the server's state right now, not about the state
//     an hour ago when the button was pressed.
//   /auth/ — signing in cannot be deferred; there is nothing to defer it to.
//   The superadmin routes (/gyms/, tiers, credits) — a different person, on a
//     different machine, with a live connection. Not the desk's outage to solve.

const RULES = [
  { method: 'POST', pattern: /^\/payments\/?$/ },
  { method: 'POST', pattern: /^\/expenses\/?$/ },
  { method: 'POST', pattern: /^\/members\/?$/ },
  { method: 'PATCH', pattern: /^\/members\/\d+\/?$/ },
  { method: 'PUT', pattern: /^\/members\/\d+\/?$/ },
  { method: 'POST', pattern: /^\/inventory\/\d+\/adjust\/?$/ },
]

/** The request path with the API base and any query string stripped off. */
function pathOf(url = '') {
  const withoutQuery = url.split('?')[0]
  // Requests are made against the axios instance's baseURL, so `url` is usually
  // already relative ('/payments/'). An absolute one is normalised here so both
  // shapes are matched the same way.
  const afterApi = withoutQuery.replace(/^https?:\/\/[^/]+/, '').replace(/^\/api/, '')
  return afterApi.startsWith('/') ? afterApi : `/${afterApi}`
}

/**
 * May this request wait on the device for the connection to return?
 *
 * A multipart body (a member photo, a gym logo) is refused whatever the route:
 * the queue stores plain JSON, and a File handle does not survive being written
 * to IndexedDB and read back as one.
 */
export function isQueueable(config) {
  if (!config) return false
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) return false

  const method = String(config.method || 'get').toUpperCase()
  const path = pathOf(config.url)
  return RULES.some((rule) => rule.method === method && rule.pattern.test(path))
}

/** A short human label for the pending list, e.g. "Payment". */
export function describeWrite(config) {
  const path = pathOf(config?.url)
  const method = String(config?.method || '').toUpperCase()

  if (/^\/payments\//.test(path)) return 'Payment'
  if (/^\/expenses\//.test(path)) return 'Expense'
  if (/^\/inventory\/\d+\/adjust/.test(path)) return 'Stock change'
  if (/^\/members\/\d+/.test(path)) return 'Member edit'
  if (/^\/members\//.test(path) && method === 'POST') return 'New member'
  return 'Change'
}

export { pathOf }
