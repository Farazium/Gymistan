// One place that decides what a membership status looks like, so the members
// table, the profile header and the payment modal can never disagree on a colour
// or a word. Mirrors the backend's members/serializers.compute_status: an expired
// membership reads EXPIRED even while a balance is owed — renewing comes first.

export const STATUS_STYLES = {
  ACTIVE: { label: 'Active', badge: 'bg-green-500/20 text-green-400' },
  PARTIAL: { label: 'Partial', badge: 'bg-yellow-500/20 text-yellow-400' },
  EXPIRED: { label: 'Expired', badge: 'bg-red-500/20 text-red-400' },
}

export const statusStyle = (status) => STATUS_STYLES[status] || STATUS_STYLES.EXPIRED

export const memberDues = (member) => Number(member?.dues || 0)

/**
 * The member's status as of today, worked out here rather than read off the row.
 *
 * The server stamps `status` when it answers, and offline that answer can be days
 * old — a cached list would go on calling a member ACTIVE a week after they
 * lapsed, which is the one thing the desk must not be told wrongly. Expiry is a
 * date, so the browser can settle it without asking anyone.
 *
 * Same order as the backend's compute_status: expiry beats dues, and the expiry
 * day itself already counts as expired.
 */
export function currentStatus(member) {
  if (!member) return 'EXPIRED'
  if (!member.expiry_date) return member.status || 'ACTIVE'

  // Compare as plain dates in the viewer's own day, never as timestamps: an
  // expiry of 2026-08-13 parsed as UTC midnight is already "yesterday" in
  // Pakistan, and the member would read expired for the whole of their last day.
  const today = new Date()
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  if (member.expiry_date <= todayISO) return 'EXPIRED'
  return memberDues(member) > 0 ? 'PARTIAL' : 'ACTIVE'
}
