/* The marker every row that only exists on this device wears.

   Deliberately loud enough to read at a glance from across a desk: a row without
   it is in the books, a row with it is not yet. See offline/pending.js. */
import { Clock } from 'lucide-react'

export default function PendingBadge({ className = '' }) {
  return (
    <span
      title="Recorded on this device — waiting for the connection to come back"
      className={`inline-flex items-center gap-1 shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-sky-500/15 text-sky-300 border border-sky-500/30 ${className}`}
    >
      <Clock size={10} />
      Waiting to sync
    </span>
  )
}
