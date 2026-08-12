/* Showing queued work in the lists it belongs to.

   A payment taken during an outage is a real thing that happened, and hiding it
   on a separate screen until the internet comes back makes the desk keep two
   sets of books in their head: the one on screen and the one they know about.
   So a queued write appears as a row in the table it will eventually join.

   It is not disguised as a saved row. It carries a badge, it is dimmed, and
   every action on it is off — because a queued write has no server id, and
   there is nothing to fetch a slip for, message a receipt about, edit or delete.
   Offering those would produce a request about a record the server has never
   heard of.

   The rows are derived from the queue on every render rather than written into
   the query cache, so they survive a reload — which is exactly when they matter,
   since a reload is what an offline desk does when something looks wrong. */

import { useEffect, useState } from 'react'
import useAuthStore from '../store/authStore'
import { pendingFor, subscribe } from './queue'

/** Everything this user has queued, oldest first. Re-reads on any queue change. */
export function usePendingWrites() {
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const [entries, setEntries] = useState([])

  useEffect(() => {
    const load = () => pendingFor(userId).then(setEntries).catch(() => setEntries([]))
    load()
    return subscribe(load)
  }, [userId])

  return entries
}

/** True for a row this module made up. Guard every action with it. */
export const isPendingRow = (row) => row?.__pending === true

const isoDate = (ms) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// A string id, deliberately not a number: anything that treats it as one and
// sends it to the server gets an obvious error rather than hitting record 3.
const rowId = (entry) => `pending-${entry.id}`

const match = (entry, method, pattern) =>
  entry.method === method && pattern.test(String(entry.url).split('?')[0])

/** Queued payments, shaped like the rows of the payments list. */
export function pendingPayments(entries) {
  return entries
    .filter((e) => match(e, 'POST', /^\/payments\/?$/))
    .map((e) => {
      const d = e.data || {}
      const meta = e.meta || {}
      const payable = Number(d.amount || 0) - Number(d.discount || 0)
      const paid = Number(d.amount_paid || 0)
      return {
        id: rowId(e),
        __pending: true,
        __queueId: e.id,
        member_name: meta.member_name || d.walkin_name || 'Member',
        member_phone: meta.member_phone || d.walkin_phone || '',
        package_name: meta.package_name || '',
        month: d.month || '',
        amount: d.amount,
        amount_paid: d.amount_paid,
        discount: d.discount,
        remaining: Math.max(payable - paid, 0),
        status: payable - paid > 0 ? 'PARTIAL' : 'PAID',
        payment_method: d.payment_method || 'CASH',
        payment_date: d.payment_date || isoDate(e.createdAt),
        is_walkin: !!d.walkin_name,
        slip_sent: false,
      }
    })
}

/** Queued expenses, shaped like the rows of the expenses list. */
export function pendingExpenses(entries) {
  return entries
    .filter((e) => match(e, 'POST', /^\/expenses\/?$/))
    .map((e) => {
      const d = e.data || {}
      return {
        id: rowId(e),
        __pending: true,
        __queueId: e.id,
        title: d.title || 'Expense',
        category: d.category || 'Other',
        amount: d.amount,
        description: d.description || '',
        date: d.date || isoDate(e.createdAt),
      }
    })
}

/** Queued new members, shaped like the rows of the members table. */
export function pendingMembers(entries) {
  return entries
    .filter((e) => match(e, 'POST', /^\/members\/?$/))
    .map((e) => {
      const d = e.data || {}
      return {
        id: rowId(e),
        __pending: true,
        __queueId: e.id,
        member_id: d.member_id || '',
        name: d.name || 'New member',
        phone: d.phone || '',
        gender: d.gender || '',
        status: d.status || 'ACTIVE',
        expiry_date: d.expiry_date || null,
        dues: 0,
        package_name: (e.meta && e.meta.package_name) || '',
        trainer_name: '',
      }
    })
}
