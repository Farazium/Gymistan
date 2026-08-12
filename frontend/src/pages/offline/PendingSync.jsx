/* Everything this device recorded that the server has not confirmed.

   Two lists, and the difference between them matters more than anything else on
   the page:

   * Waiting — entered offline, still good, will go up on its own. Nothing to do.
   * Rejected — the server saw it and refused it. This is the dangerous pile:
     money the desk believes it took that is not in the books. Each row shows
     what the server actually said, and offers the only two honest options —
     send it again, or throw it away knowingly.

   There is deliberately no "fix and resend" here. Editing a queued payment into
   something the server will accept is guesswork about what the desk meant; the
   safe path is to discard the bad entry and re-enter it on the real form, where
   the same validation that rejected it will guide them. */
import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { UploadCloud, AlertTriangle, RotateCcw, Trash2, CheckCircle2 } from 'lucide-react'
import useAuthStore from '../../store/authStore'
import useNetStore from '../../store/netStore'
import { entriesFor, subscribe, remove, retry, PENDING, FAILED } from '../../offline'
import { fmtCurrency as fmt } from '../../utils/format'

const when = (ms) =>
  new Date(ms).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })

/** The one or two figures worth showing from a queued body, without pretending
    to render the whole form back. */
function summarise(entry) {
  const d = entry.data || {}
  const bits = []
  if (d.amount_paid != null) bits.push(`Paid ${fmt(d.amount_paid)}`)
  else if (d.amount != null) bits.push(fmt(d.amount))
  if (d.name) bits.push(d.name)
  if (d.walkin_name) bits.push(d.walkin_name)
  if (d.category) bits.push(String(d.category))
  if (d.quantity != null && d.action) bits.push(`${d.action} ${d.quantity}`)
  return bits.join(' · ')
}

function Row({ entry, onRetry, onDiscard, busy }) {
  const isFailed = entry.status === FAILED
  return (
    <div className="card flex flex-wrap items-start gap-x-4 gap-y-2 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-100">{entry.label}</span>
          <span className="text-xs text-gray-400">{when(entry.createdAt)}</span>
        </div>
        {summarise(entry) && (
          <p className="mt-0.5 text-sm text-gray-300">{summarise(entry)}</p>
        )}
        {isFailed && entry.error && (
          <p className="mt-1 text-xs text-red-300">Server said: {entry.error}</p>
        )}
        {!isFailed && entry.attempts > 0 && (
          <p className="mt-1 text-xs text-gray-400">
            Tried {entry.attempts} {entry.attempts === 1 ? 'time' : 'times'} so far
          </p>
        )}
      </div>

      {isFailed && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onRetry(entry)}
            disabled={busy}
            className="btn-secondary !px-3 !py-1 text-xs"
          >
            <RotateCcw size={13} />
            Try again
          </button>
          <button
            onClick={() => onDiscard(entry)}
            disabled={busy}
            className="btn-secondary !px-3 !py-1 text-xs !text-red-300"
          >
            <Trash2 size={13} />
            Discard
          </button>
        </div>
      )}
    </div>
  )
}

export default function PendingSync() {
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const online = useNetStore((s) => s.online)
  const [entries, setEntries] = useState([])
  const [busy, setBusy] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(null)

  const load = useCallback(() => {
    entriesFor(userId).then(setEntries).catch(() => setEntries([]))
  }, [userId])

  useEffect(() => {
    load()
    return subscribe(load)
  }, [load])

  const pending = entries.filter((e) => e.status === PENDING)
  const failed = entries.filter((e) => e.status === FAILED)

  const onRetry = async (entry) => {
    setBusy(true)
    try {
      await retry(entry.id)
      toast.success(online
        ? 'Queued again — it will be sent shortly'
        : 'Queued again — it will go up when the connection returns')
    } finally {
      setBusy(false)
    }
  }

  const onDiscard = async (entry) => {
    setBusy(true)
    try {
      await remove(entry.id)
      toast.success('Entry discarded')
      setConfirmDiscard(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Pending sync</h1>
        <p className="mt-1 text-sm text-gray-400">
          Work recorded on this device that the server has not confirmed yet.
        </p>
      </div>

      {failed.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-red-200">
            <AlertTriangle size={16} />
            Rejected ({failed.length})
          </h2>
          <p className="text-xs text-gray-400">
            The server refused these, so they are <strong>not</strong> in the books.
            Read what it said, then either send it again or discard it and re-enter
            it properly.
          </p>
          {failed.map((entry) => (
            <Row
              key={entry.id}
              entry={entry}
              busy={busy}
              onRetry={onRetry}
              onDiscard={() => setConfirmDiscard(entry)}
            />
          ))}
        </section>
      )}

      {pending.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-sky-200">
            <UploadCloud size={16} />
            Waiting ({pending.length})
          </h2>
          <p className="text-xs text-gray-400">
            {online
              ? 'The connection is back — these are being sent now.'
              : 'These will be sent on their own once the connection returns. Nothing to do.'}
          </p>
          {pending.map((entry) => (
            <Row key={entry.id} entry={entry} busy={busy} onRetry={onRetry} onDiscard={onDiscard} />
          ))}
        </section>
      )}

      {entries.length === 0 && (
        <div className="card flex flex-col items-center gap-2 py-12 text-center">
          <CheckCircle2 size={28} className="text-green-400" />
          <p className="text-sm font-medium text-gray-200">Everything is synced</p>
          <p className="text-xs text-gray-400">
            Nothing is waiting on this device. Anything you record while offline
            will show up here until the server has it.
          </p>
        </div>
      )}

      {confirmDiscard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-md space-y-4 p-5">
            <h3 className="text-lg font-semibold text-white">Discard this entry?</h3>
            <p className="text-sm text-gray-300">
              <strong>{confirmDiscard.label}</strong>
              {summarise(confirmDiscard) ? ` — ${summarise(confirmDiscard)}` : ''}
            </p>
            <p className="text-sm text-gray-400">
              It will be deleted from this device and never sent. If this was money
              the gym actually took, record it again on the normal form first.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDiscard(null)} className="btn-secondary !px-3 !py-1.5 text-sm">
                Keep it
              </button>
              <button
                onClick={() => onDiscard(confirmDiscard)}
                disabled={busy}
                className="btn-primary !bg-red-600 !px-3 !py-1.5 text-sm hover:!bg-red-700"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
