// Membership expiry math for the member forms. Mirrors the backend's
// apps/common/dates.py — a membership keeps its joining day-of-month forever, and
// a day that a short month had to clamp (31 Jan -> 28 Feb) comes back on the next
// long month (-> 31 Mar), so both sides agree on what the next expiry is.

const pad = (n) => String(n).padStart(2, '0')
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const daysIn = (year, month) => new Date(year, month, 0).getDate() // month is 1-based

// Date built from a 1-based month with the day clamped to that month's length.
// `new Date(2026, 1, 31)` would silently roll over into March instead.
const clampedDate = (year, month, day) => new Date(year, month - 1, Math.min(day, daysIn(year, month)))

/**
 * Expiry for a member being added: roll forward from the joining date in
 * package-length cycles. ACTIVE -> the first cycle end after today; EXPIRED ->
 * the last cycle end on or before today (the date their membership lapsed).
 */
export function calcExpiryISO(isoDate, status, pkgMonths) {
  if (!isoDate || isoDate.length < 10) return ''
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m || !d) return ''
  const months = pkgMonths || 1
  const today = new Date(); today.setHours(0, 0, 0, 0)

  let yy = y, mm = m
  for (let i = 0; i < 120; i++) {
    mm += months
    while (mm > 12) { yy += 1; mm -= 12 }
    if (clampedDate(yy, mm, d) > today) {
      if (status === 'EXPIRED') {
        mm -= months
        while (mm < 1) { yy -= 1; mm += 12 }
        return isoOf(clampedDate(yy, mm, d))
      }
      return isoOf(clampedDate(yy, mm, d))
    }
  }
  return ''
}

export function calcExpiryDisplay(isoDate, status, pkgMonths) {
  const iso = calcExpiryISO(isoDate, status, pkgMonths)
  if (!iso) return ''
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
