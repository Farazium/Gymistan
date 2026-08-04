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
