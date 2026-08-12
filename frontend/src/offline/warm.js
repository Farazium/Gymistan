// Filling the read cache before it is needed.
//
// The service worker only holds what has actually been fetched through it, so
// left to itself the cache is a record of wherever the desk happened to click
// while the line was up. That is a bad deal to offer an accountant: it means
// remembering, every morning, to open Members and Payments and Expenses in case
// the internet goes later. Nobody does that, and the first time they don't, the
// app comes up offline showing zero members and zero takings — which is worse
// than an error, because it looks like an answer.
//
// So the app fetches the main lists itself, once, whenever it has a connection.
// The requests go through the ordinary axios instance, which means the worker
// caches them exactly as if a page had asked.
//
// The URLs here must match what the pages request *character for character* —
// the cache is keyed on the full URL, so `/api/members/` and `/api/members/?x=`
// are two different entries and only one of them will be there when it matters.
// Each entry below mirrors a page's default, unfiltered request. Filtered views
// are deliberately not warmed: there is no end to the combinations, and a filter
// is something the desk applies to data it can already see.

import api from '../api/axios'

const WA_TIERS = ['TIER2_WA', 'TIER3']
const AT_TIERS = ['TIER2_AT', 'TIER3']

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * What to fetch, for this user.
 *
 * Tier and role gate the list because the alternative is asking a Starter gym's
 * browser for the WhatsApp balance every time it opens, getting a 403, and
 * caching nothing — noise on the server and on the gym's mobile data, for no
 * offline benefit at all.
 */
function plan(user) {
  const superadmin = user?.role === 'SUPERADMIN'

  if (superadmin) {
    // A superadmin's screens are about other people's gyms and are useless from
    // a stale copy; they also always work from a connected machine. Only their
    // own identity is worth holding.
    return [['/auth/me/']]
  }

  const entries = [
    ['/auth/me/'],
    ['/dashboard/'],

    // The roster and the two side lists the Members page can open.
    ['/members/'],
    ['/members/next-id/'],
    ['/members/deleted/'],
    ['/members/blacklisted/'],

    // Needed by every form that picks a package or a trainer, not just their
    // own pages — a payment cannot be entered offline without them.
    ['/packages/'],
    ['/trainers/'],
    ['/trainers/', { is_active: 'true' }],

    ['/payments/'],
    ['/expenses/'],
    ['/inventory/'],
    ['/inventory/sales/'],
  ]

  if (WA_TIERS.includes(user?.gym_tier)) entries.push(['/gyms/whatsapp-billing/'])
  if (AT_TIERS.includes(user?.gym_tier)) {
    entries.push(['/attendance/device/'])
    // The sheet the page opens on: today, members, daily.
    entries.push(['/attendance/', { type: 'member', scope: 'daily', date: todayISO() }])
  }

  return entries
}

let running = false

/**
 * Fetch the main lists so they are in the cache when the line drops.
 *
 * Sequential on purpose. This runs in the background behind whatever the desk is
 * actually doing, and firing fifteen requests at once at a two-core VPS — or at
 * a phone hotspot with a day's data left — to populate a cache nobody has asked
 * for yet is the wrong way round. One at a time is slower and entirely
 * unnoticed.
 *
 * Every failure is swallowed. A warm that half-works leaves half a cache, which
 * is exactly what it would have left anyway, and nothing here is worth putting
 * an error in front of the desk for.
 */
export async function warmCache(user) {
  if (running) return { warmed: 0 }
  running = true

  let warmed = 0
  try {
    for (const [url, params] of plan(user)) {
      try {
        await api.get(url, params ? { params } : undefined)
        warmed += 1
      } catch {
        // Offline again, or an endpoint this gym cannot see. Either way, move on.
      }
    }
  } finally {
    running = false
  }
  return { warmed }
}
