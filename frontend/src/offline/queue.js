// The offline write queue: what the desk did while the line was down.
//
// One record per write, held in IndexedDB until the server has confirmed it. A
// record carries the idempotency key it was born with — the same key on every
// attempt — which is what makes re-sending safe (see backend
// apps/common/idempotency.py). Generate a new key per attempt and the whole
// exercise becomes a way to charge members twice.
//
// Records are scoped to the user who made them. A gym where the owner and the
// accountant share a machine must never have one person's queued payments
// replayed under the other's login: `collected_by` is stamped from the token the
// replay is sent with, so the books would name the wrong person.

import * as db from './db'

export const PENDING = 'pending'
export const FAILED = 'failed'

const listeners = new Set()

/** Subscribe to any change in the queue. Returns an unsubscribe function. */
export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function announce() {
  listeners.forEach((fn) => {
    try { fn() } catch { /* a broken listener must not stop the others */ }
  })
}

function newKey() {
  // randomUUID needs a secure context. The app is HTTPS in production and
  // localhost in development, both of which qualify — but a gym opening the site
  // over plain http on a LAN address would not, and losing the queue over a
  // missing function would be a poor trade.
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

/**
 * Put a write on the queue.
 *
 * `key` is passed in rather than made here, because the request that failed had
 * already been stamped with one on its way out — and that is the key the server
 * may have seen. Making a fresh one now would hide a write that already landed.
 */
export async function enqueue({ key, method, url, data, label, userId }) {
  const record = await db.add({
    key: key || newKey(),
    method: String(method || 'post').toUpperCase(),
    url,
    data: data ?? null,
    label: label || 'Change',
    userId: userId ?? null,
    status: PENDING,
    attempts: 0,
    error: null,
    createdAt: Date.now(),
  })
  announce()
  return record
}

/** Everything on the queue, oldest first, for this user. */
export async function entriesFor(userId) {
  const rows = await db.all()
  // A record with no userId predates the stamping, or was written by a build
  // that had no user to hand. It belongs to whoever is here now rather than to
  // nobody — stranding a payment forever is the worse failure.
  return rows.filter((r) => r.userId == null || r.userId === userId)
}

export async function pendingFor(userId) {
  return (await entriesFor(userId)).filter((r) => r.status === PENDING)
}

export async function failedFor(userId) {
  return (await entriesFor(userId)).filter((r) => r.status === FAILED)
}

export async function countFor(userId) {
  const rows = await entriesFor(userId)
  return {
    pending: rows.filter((r) => r.status === PENDING).length,
    failed: rows.filter((r) => r.status === FAILED).length,
  }
}

export async function update(id, patch) {
  const existing = await db.get(id)
  if (!existing) return null
  const next = { ...existing, ...patch }
  await db.put(next)
  announce()
  return next
}

export async function remove(id) {
  await db.remove(id)
  announce()
}

/** Move a rejected write back to pending so the desk can try it again. */
export async function retry(id) {
  return update(id, { status: PENDING, error: null })
}

export const isAvailable = db.isAvailable
export { newKey }
